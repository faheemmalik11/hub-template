//   npx tsx scripts/db/import-historic-deals.ts <path-to-file> [--sheet=<name>]            # dry run, writes nothing
//   npx tsx scripts/db/import-historic-deals.ts <path-to-file> [--sheet=<name>] --commit   # do it
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env. A row with no `hub_deal_id` is a
// historic sale, inserted as a new `settled` deal; a row with one fills in an existing
// `incomplete` deal and promotes it to `ready`, never to `settled`.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import * as XLSX from "xlsx";

import { dealGrossTotalCentsOf } from "@/components/commission/deal-form";
import type { DealListRow, FeeKind } from "@/data/deals/deals";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const commit = process.argv.includes("--commit");
const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
const sheetFlag = process.argv.slice(2).find((a) => a.startsWith("--sheet="));
const requestedSheet = sheetFlag ? sheetFlag.slice("--sheet=".length).trim() : null;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both needed in .env.");
  process.exit(1);
}
if (!path) {
  console.error(
    "Usage: npx tsx scripts/db/import-historic-deals.ts <path-to-file> [--sheet=<name>] [--commit]",
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function normalizeName(name: string): string | null {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized || null;
}

// German property prices are written with a period as the thousands separator and a comma as the
// decimal point (450.000,00). A comma in the input means treat it as German; otherwise the value
// is already plain (300000 or 300000.00) and needs no rewriting.
function parseGermanNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalized);
}

function isoDateOf(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Postgres reads "09.11.2025" as 2025-09-11 under its default ISO/MDY DateStyle, never as an error.
function parseDateField(raw: string, fieldName: string, rowNumber: number): string | null {
  if (!raw) return null;
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (german) {
    const parsed = isoDateOf(Number(german[3]), Number(german[2]), Number(german[1]));
    if (!parsed) throw new Error(`row ${rowNumber}: ${fieldName} is not a real date, got "${raw}"`);
    return parsed;
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(raw);
  if (iso) {
    const parsed = isoDateOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!parsed) throw new Error(`row ${rowNumber}: ${fieldName} is not a real date, got "${raw}"`);
    return parsed;
  }
  throw new Error(
    `row ${rowNumber}: ${fieldName} must be DD.MM.YYYY or YYYY-MM-DD, got "${raw}". ` +
      "Reformat that column in the spreadsheet before importing.",
  );
}

// XLSX builds a dated cell at local midnight, which toISOString would push back a day east of UTC.
function cellText(cell: unknown): string {
  if (!(cell instanceof Date)) return String(cell ?? "").trim();
  const year = String(cell.getFullYear()).padStart(4, "0");
  const month = String(cell.getMonth() + 1).padStart(2, "0");
  const day = String(cell.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

const mandatoryHeaders = ["property", "notarised_on", "purchase_price"];
const optionalHeaders = [
  "hub_deal_id",
  "vat_rate",
  "buyer_side_fee_kind",
  "buyer_side_rate_or_amount",
  "buyer_payer_name",
  "seller_side_fee_kind",
  "seller_side_rate_or_amount",
  "seller_payer_name",
  "source_external_id",
  "row_id",
];

function assertHeadersUsable(headers: string[]): void {
  const found = headers.map((h) => h.trim()).filter((h) => h !== "");
  const present = new Set(found.map((h) => h.toLowerCase()));
  const foundList = found.length > 0 ? found.join(" | ") : "(no headers at all)";
  const recognised = [...mandatoryHeaders, ...optionalHeaders].filter((h) => present.has(h));

  if (recognised.length === 0) {
    throw new Error(
      `this file has none of the columns the import needs — it is almost certainly the wrong file or the wrong sheet.\n` +
        `  needed:   ${mandatoryHeaders.join(", ")}\n` +
        `  this file: ${foundList}`,
    );
  }

  const missing = mandatoryHeaders.filter((h) => !present.has(h));
  if (missing.length > 0) {
    throw new Error(
      `these columns are missing: ${missing.join(", ")}\n` + `  this file: ${foundList}`,
    );
  }

  for (const side of ["buyer", "seller"] as const) {
    const hasKind = present.has(`${side}_side_fee_kind`);
    const hasAmount = present.has(`${side}_side_rate_or_amount`);
    if (hasKind !== hasAmount) {
      throw new Error(
        `${side}_side_fee_kind and ${side}_side_rate_or_amount belong together, and this file has ` +
          `only ${hasKind ? `${side}_side_fee_kind` : `${side}_side_rate_or_amount`}.`,
      );
    }
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const header of found.map((h) => h.toLowerCase())) {
    if (seen.has(header)) duplicates.add(header);
    seen.add(header);
  }
  if (duplicates.size > 0) {
    throw new Error(`these columns appear more than once: ${[...duplicates].join(", ")}`);
  }
}

function sheetNameOf(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames;
  if (names.length === 0) throw new Error("the Excel file has no sheets");
  if (requestedSheet) {
    if (!names.includes(requestedSheet)) {
      throw new Error(
        `the Excel file has no sheet named "${requestedSheet}". It has: ${names.join(", ")}`,
      );
    }
    return requestedSheet;
  }
  if (names.length > 1) {
    throw new Error(
      `the Excel file has ${names.length} sheets, so pick one with --sheet=<name>: ${names.join(", ")}`,
    );
  }
  return names[0];
}

function parseInput(filePath: string): ParsedTable {
  if (filePath.endsWith(".csv")) {
    const result = Papa.parse<Record<string, string>>(readFileSync(filePath, "utf8"), {
      header: true,
      skipEmptyLines: true,
      delimitersToGuess: [",", ";", "\t", "|"],
    });
    const fatal = result.errors.find((e) => e.type !== "FieldMismatch");
    if (fatal)
      throw new Error(`could not read the CSV: ${fatal.message} (row ${(fatal.row ?? 0) + 2})`);
    const headers = result.meta.fields ?? [];
    assertHeadersUsable(headers);
    return { headers, rows: result.data };
  }

  const workbook = XLSX.read(readFileSync(filePath), { type: "buffer", cellDates: true });
  const sheetName = sheetNameOf(workbook);
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });
  const headerRowIndex = matrix.findIndex((row) => row.some((cell) => cellText(cell) !== ""));
  if (headerRowIndex === -1) throw new Error(`sheet "${sheetName}" has no data`);
  const headers = matrix[headerRowIndex].map((cell) => cellText(cell));
  assertHeadersUsable(headers);
  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cellText(cell) !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, i) => (record[header] = cellText(row[i])));
      return record;
    });
  return { headers, rows };
}

interface SheetSide {
  feeKind: FeeKind;
  rateOrAmount: number;
  payerName: string | null;
}

interface SheetRow {
  rowNumber: number;
  hubDealId: string | null;
  property: string;
  notarisedOn: string | null;
  purchasePrice: number | null;
  vatRate: number | null;
  buyer: SheetSide | null;
  seller: SheetSide | null;
  sourceExternalId: string | null;
  rowId: string | null;
}

function col(row: Record<string, string>, headers: string[], name: string): string {
  const key = headers.find((h) => h.trim().toLowerCase() === name);
  return key ? (row[key] ?? "").trim() : "";
}

function sideOf(
  row: Record<string, string>,
  headers: string[],
  prefix: "buyer" | "seller",
): SheetSide | null {
  const kind = col(row, headers, `${prefix}_side_fee_kind`).toLowerCase();
  const raw = col(row, headers, `${prefix}_side_rate_or_amount`);
  if (!kind && !raw) return null;
  if (kind !== "percent" && kind !== "fixed") {
    throw new Error(`${prefix}_side_fee_kind must be "percent" or "fixed", got "${kind}"`);
  }
  const value = parseGermanNumber(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${prefix}_side_rate_or_amount must be a positive number, got "${raw}"`);
  }
  return {
    feeKind: kind,
    rateOrAmount: value,
    payerName: col(row, headers, `${prefix}_payer_name`) || null,
  };
}

function parseAmountField(raw: string, fieldName: string, rowNumber: number): number | null {
  if (!raw) return null;
  const value = parseGermanNumber(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`row ${rowNumber}: ${fieldName} is not a number, got "${raw}"`);
  }
  return value;
}

function parseRow(row: Record<string, string>, headers: string[], rowNumber: number): SheetRow {
  const priceRaw = col(row, headers, "purchase_price");
  const vatRaw = col(row, headers, "vat_rate");
  return {
    rowNumber,
    hubDealId: col(row, headers, "hub_deal_id") || null,
    property: col(row, headers, "property"),
    notarisedOn: parseDateField(col(row, headers, "notarised_on"), "notarised_on", rowNumber),
    purchasePrice: parseAmountField(priceRaw, "purchase_price", rowNumber),
    vatRate: parseAmountField(vatRaw, "vat_rate", rowNumber),
    buyer: sideOf(row, headers, "buyer"),
    seller: sideOf(row, headers, "seller"),
    sourceExternalId: col(row, headers, "source_external_id") || null,
    rowId: col(row, headers, "row_id") || null,
  };
}

function externalIdFor(row: SheetRow): string {
  if (row.sourceExternalId) return row.sourceExternalId;
  if (row.rowId) return `row:${row.rowId}`;
  const basis = `${row.property}|${row.notarisedOn}|${row.purchasePrice}`;
  return `hash:${createHash("sha256").update(basis).digest("hex").slice(0, 32)}`;
}

interface CustomerMatch {
  id: string | null;
  ambiguous: boolean;
}

const unresolvedPayerId = "(new customer, dry run)";

async function resolvePayer(
  name: string,
  problems: string[],
  rowNumber: number,
): Promise<CustomerMatch> {
  const normalized = normalizeName(name);
  if (!normalized) return { id: null, ambiguous: false };

  const { data, error } = await sb
    .from("customers")
    .select("id")
    .eq("normalized_name", normalized)
    .is("deleted_at", null);
  if (error) throw new Error(`customer lookup failed: ${error.message}`);

  if ((data ?? []).length > 1) {
    problems.push(
      `row ${rowNumber}: "${name}" matches more than one customer, needs manual linking`,
    );
    return { id: null, ambiguous: true };
  }
  if ((data ?? []).length === 1) return { id: data[0].id, ambiguous: false };

  if (!commit) return { id: unresolvedPayerId, ambiguous: false };
  const { data: created, error: createError } = await sb
    .from("customers")
    .insert({ name, normalized_name: normalized, is_company: true, source: "app" })
    .select("id")
    .single();
  if (createError) throw new Error(`could not create customer "${name}": ${createError.message}`);
  return { id: created.id, ambiguous: false };
}

async function resolveCompanyId(): Promise<string> {
  const { data, error } = await sb
    .from("companies")
    .select("id")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`company lookup failed: ${error.message}`);
  if (!data) throw new Error("no company exists in this database — create one before importing");
  return data.id;
}

async function resolvePropertyId(
  name: string,
  problems: string[],
  rowNumber: number,
): Promise<string | null> {
  if (!name) return null;
  const { data, error } = await sb
    .from("properties")
    .select("id")
    .eq("name", name)
    .is("deleted_at", null);
  if (error) throw new Error(`property lookup failed: ${error.message}`);

  const matches = data ?? [];
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) {
    problems.push(
      `row ${rowNumber}: no property is named "${name}", so the deal keeps the name as plain text and stays unlinked`,
    );
  } else {
    problems.push(
      `row ${rowNumber}: "${name}" matches ${matches.length} properties, so the deal stays unlinked until one is picked`,
    );
  }
  return null;
}

async function addPayerToSide(
  dealSideId: string,
  payerName: string,
  problems: string[],
  rowNumber: number,
): Promise<string | null> {
  const payer = await resolvePayer(payerName, problems, rowNumber);
  if (!payer.id || payer.id === unresolvedPayerId) return payer.id;
  const { error } = await sb
    .from("deal_parties")
    .upsert(
      { deal_side_id: dealSideId, customer_id: payer.id, position: 0 },
      { onConflict: "deal_side_id,customer_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`could not add the payer: ${error.message}`);
  return payer.id;
}

type ProjectedSide = DealListRow["deal_sides"][number];

function projectedSideOf(
  side: "buyer" | "seller",
  sheetSide: SheetSide,
  payerId: string | null,
): ProjectedSide {
  return {
    side,
    fee_kind: sheetSide.feeKind,
    fee_net_rate: sheetSide.feeKind === "percent" ? sheetSide.rateOrAmount : null,
    fee_net_amount: sheetSide.feeKind === "fixed" ? sheetSide.rateOrAmount : null,
    deal_parties: payerId
      ? [{ customer_id: payerId, share_percent: null, discount_gross: 0, discount_reason: null }]
      : [],
  };
}

async function insertSideAndParties(
  dealId: string | null,
  side: "buyer" | "seller",
  sheetSide: SheetSide,
  problems: string[],
  rowNumber: number,
): Promise<ProjectedSide> {
  if (!commit || !dealId) {
    const payer = sheetSide.payerName
      ? await resolvePayer(sheetSide.payerName, problems, rowNumber)
      : { id: null, ambiguous: false };
    return projectedSideOf(side, sheetSide, payer.id);
  }

  const { data: sideRow, error: sideError } = await sb
    .from("deal_sides")
    .upsert(
      {
        deal_id: dealId,
        side,
        fee_kind: sheetSide.feeKind,
        fee_net_rate: sheetSide.feeKind === "percent" ? sheetSide.rateOrAmount : null,
        fee_net_amount: sheetSide.feeKind === "fixed" ? sheetSide.rateOrAmount : null,
      },
      { onConflict: "deal_id,side", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (sideError) throw new Error(`could not add the ${side} side: ${sideError.message}`);

  const payerId =
    sideRow && sheetSide.payerName
      ? await addPayerToSide(sideRow.id, sheetSide.payerName, problems, rowNumber)
      : null;
  return projectedSideOf(side, sheetSide, payerId);
}

async function importNewSettledRow(
  row: SheetRow,
  report: { inserted: number; alreadyImported: number },
  problems: string[],
): Promise<void> {
  const externalId = externalIdFor(row);

  const { data: existing, error: existingError } = await sb
    .from("deals")
    .select("id")
    .eq("source", "historic_import")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existingError) throw new Error(`idempotency check failed: ${existingError.message}`);
  if (existing) {
    report.alreadyImported++;
    return;
  }

  report.inserted++;
  const propertyId = await resolvePropertyId(row.property, problems, row.rowNumber);

  let dealId: string | null = null;
  if (commit) {
    const companyId = await resolveCompanyId();
    const { data: deal, error: dealError } = await sb
      .from("deals")
      .insert({
        company_id: companyId,
        property_id: propertyId,
        property_label: propertyId ? null : row.property || null,
        source: "historic_import",
        external_id: externalId,
        status: "settled",
        notarised_on: row.notarisedOn,
        purchase_price: row.purchasePrice,
        vat_rate: row.vatRate ?? 19,
        created_by: "import-historic-deals",
      })
      .select("id")
      .maybeSingle();
    if (dealError)
      throw new Error(`could not insert deal for row ${row.rowNumber}: ${dealError.message}`);
    if (!deal) return; // on-conflict race with a concurrent run — treated as already-imported
    dealId = deal.id;
  }

  if (row.buyer) await insertSideAndParties(dealId, "buyer", row.buyer, problems, row.rowNumber);
  if (row.seller) await insertSideAndParties(dealId, "seller", row.seller, problems, row.rowNumber);
}

interface ExistingDealRow {
  id: string;
  status: string;
  notarised_on: string | null;
  purchase_price: number | null;
  vat_rate: number;
  company_id: string | null;
  property_id: string | null;
  property_label: string | null;
  deal_sides: Array<DealListRow["deal_sides"][number] & { id: string }>;
}

async function completeExistingRow(
  row: SheetRow,
  report: { matched: number; updated: number; promoted: number; stillIncomplete: number },
  problems: string[],
  mismatches: string[],
): Promise<void> {
  if (!row.hubDealId) return;
  report.matched++;

  const { data: deal, error } = await sb
    .from("deals")
    .select(
      "id, status, notarised_on, purchase_price, vat_rate, company_id, property_id, property_label, " +
        "deal_sides(id, side, fee_kind, fee_net_rate, fee_net_amount, " +
        "deal_parties(customer_id, share_percent, discount_gross, discount_reason))",
    )
    .eq("id", row.hubDealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`lookup for hub_deal_id ${row.hubDealId} failed: ${error.message}`);
  if (!deal) {
    problems.push(
      `row ${row.rowNumber}: hub_deal_id ${row.hubDealId} does not exist in this database`,
    );
    return;
  }
  const existing = deal as unknown as ExistingDealRow;
  if (existing.status !== "incomplete") {
    problems.push(
      `row ${row.rowNumber}: hub_deal_id ${row.hubDealId} is already ${existing.status}, left untouched`,
    );
    return;
  }

  const fill: Record<string, unknown> = {};
  const checkField = (field: string, existingValue: unknown, sheetValue: unknown) => {
    if (sheetValue === null || sheetValue === undefined || sheetValue === "") return;
    if (existingValue === null || existingValue === undefined) {
      fill[field] = sheetValue;
    } else if (String(existingValue) !== String(sheetValue)) {
      mismatches.push(
        `deal ${existing.id} ${field}: Hub has ${existingValue}, sheet has ${sheetValue}`,
      );
    }
  };
  checkField("notarised_on", existing.notarised_on, row.notarisedOn);
  checkField("purchase_price", existing.purchase_price, row.purchasePrice);
  checkField("vat_rate", existing.vat_rate, row.vatRate);
  if (!existing.company_id) fill.company_id = await resolveCompanyId();
  if (!existing.property_id && row.property) {
    const propertyId = await resolvePropertyId(row.property, problems, row.rowNumber);
    if (propertyId) fill.property_id = propertyId;
    else if (!existing.property_label) fill.property_label = row.property;
  }

  let changed = Object.keys(fill).length > 0;
  if (commit && Object.keys(fill).length > 0) {
    const { error: updateError } = await sb.from("deals").update(fill).eq("id", existing.id);
    if (updateError) throw new Error(`could not fill deal ${existing.id}: ${updateError.message}`);
  }

  const projectedSides: ProjectedSide[] = [];
  for (const side of ["buyer", "seller"] as const) {
    const sheetSide = row[side];
    const existingSide = existing.deal_sides.find((s) => s.side === side);
    if (!sheetSide) {
      if (existingSide) projectedSides.push(existingSide);
      continue;
    }
    if (!existingSide) {
      changed = true;
      projectedSides.push(
        await insertSideAndParties(existing.id, side, sheetSide, problems, row.rowNumber),
      );
      continue;
    }
    if (sheetSide.payerName && existingSide.deal_parties.length === 0) {
      changed = true;
      const payerId = commit
        ? await addPayerToSide(existingSide.id, sheetSide.payerName, problems, row.rowNumber)
        : (await resolvePayer(sheetSide.payerName, problems, row.rowNumber)).id;
      projectedSides.push({
        ...existingSide,
        deal_parties: payerId
          ? [
              {
                customer_id: payerId,
                share_percent: null,
                discount_gross: 0,
                discount_reason: null,
              },
            ]
          : [],
      });
      continue;
    }
    projectedSides.push(existingSide);
  }

  if (changed) report.updated++;

  if (!commit) {
    const projectedDeal: DealListRow = {
      id: existing.id,
      property_id: existing.property_id,
      property_label: existing.property_label,
      status: "incomplete",
      notarised_on: existing.notarised_on ?? row.notarisedOn,
      purchase_price: existing.purchase_price ?? row.purchasePrice,
      vat_rate: existing.vat_rate,
      property: null,
      deal_sides: projectedSides,
    };
    if (dealGrossTotalCentsOf(projectedDeal) !== null) {
      report.promoted++;
    } else {
      report.stillIncomplete++;
      problems.push(
        `deal ${existing.id} (row ${row.rowNumber}) would still be incomplete after the import`,
      );
    }
    return;
  }

  const { data: reloaded, error: reloadError } = await sb
    .from("deals")
    .select(
      "id, status, purchase_price, vat_rate, " +
        "deal_sides(side, fee_kind, fee_net_rate, fee_net_amount, " +
        "deal_parties(customer_id, share_percent, discount_gross, discount_reason))",
    )
    .eq("id", existing.id)
    .single();
  if (reloadError) throw new Error(`reload for deal ${existing.id} failed: ${reloadError.message}`);

  const listRow = reloaded as unknown as DealListRow;
  const complete = dealGrossTotalCentsOf(listRow) !== null;
  if (complete) {
    const { error: promoteError } = await sb
      .from("deals")
      .update({ status: "ready" })
      .eq("id", existing.id)
      .eq("status", "incomplete");
    if (promoteError)
      throw new Error(`could not promote deal ${existing.id}: ${promoteError.message}`);
    report.promoted++;
  } else {
    report.stillIncomplete++;
    problems.push(
      `deal ${existing.id} (row ${row.rowNumber}) is still incomplete after the import`,
    );
  }
}

async function main() {
  const table = parseInput(path as string);
  const rows = table.rows.map((row, i) => parseRow(row, table.headers, i + 2));

  const newRows = rows.filter((r) => !r.hubDealId);
  const existingRows = rows.filter((r) => r.hubDealId);

  const problems: string[] = [];
  const mismatches: string[] = [];
  const newReport = { inserted: 0, alreadyImported: 0 };
  const existingReport = { matched: 0, updated: 0, promoted: 0, stillIncomplete: 0 };

  for (const row of newRows) await importNewSettledRow(row, newReport, problems);
  for (const row of existingRows)
    await completeExistingRow(row, existingReport, problems, mismatches);

  console.log(
    `New settled deals:     ${newReport.inserted} to insert, ${newReport.alreadyImported} already imported`,
  );
  console.log(
    `Existing deals filled: ${existingReport.matched} matched, ${existingReport.updated} updated`,
  );
  console.log(
    `  -> ${commit ? "promoted" : "would be promoted"} to 'ready': ${existingReport.promoted}`,
  );
  console.log(
    `  -> ${commit ? "still incomplete" : "would stay incomplete"} (missing data even after import): ${existingReport.stillIncomplete}`,
  );
  if (mismatches.length > 0) {
    console.log(
      `\nColumn mismatches (spreadsheet differs from Hub, left as-is): ${mismatches.length}`,
    );
    for (const m of mismatches.slice(0, 20)) console.log(`  - ${m}`);
    if (mismatches.length > 20) console.log(`  ... and ${mismatches.length - 20} more`);
  }
  if (problems.length > 0) {
    console.log(`\nRows needing manual attention: ${problems.length}`);
    for (const p of problems.slice(0, 20)) console.log(`  - ${p}`);
    if (problems.length > 20) console.log(`  ... and ${problems.length - 20} more`);
  }

  if (!commit) {
    console.log("\nNothing was written. Run again with --commit.");
  }
  if (problems.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
