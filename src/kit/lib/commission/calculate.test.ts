import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { calculateDealCommission, calculateSideCommission, splitByShares } from "./calculate.ts";
import type { CommissionResult } from "./types.ts";

const VAT = 19;

function invoicesOf(result: CommissionResult) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.ok ? result.invoices : [];
}

function totals(result: CommissionResult) {
  return invoicesOf(result).map((invoice) => ({
    line: invoice.lineGrossCents,
    discount: invoice.discountGrossCents,
    gross: invoice.totalGrossCents,
    net: invoice.totalNetCents,
    vat: invoice.totalVatCents,
  }));
}

describe("matches issued brokerage invoices", () => {
  test("one buyer at 3% with a discount", () => {
    const result = calculateSideCommission({
      side: "buyer",
      purchasePriceCents: 440_000_00,
      fee: { kind: "percent", netRatePercent: 3 },
      payers: [{ key: "a", discountGrossCents: 500_00 }],
      vatRatePercent: VAT,
    });
    assert.deepEqual(totals(result), [
      { line: 15_708_00, discount: 500_00, gross: 15_208_00, net: 12_779_83, vat: 2_428_17 },
    ]);
    assert.equal(invoicesOf(result)[0].grossRatePercent, 3.57);
  });

  test("one buyer at 2.5%", () => {
    const result = calculateSideCommission({
      side: "buyer",
      purchasePriceCents: 575_000_00,
      fee: { kind: "percent", netRatePercent: 2.5 },
      payers: [{ key: "a" }],
      vatRatePercent: VAT,
    });
    assert.deepEqual(totals(result), [
      { line: 17_106_25, discount: 0, gross: 17_106_25, net: 14_375_00, vat: 2_731_25 },
    ]);
    assert.equal(invoicesOf(result)[0].grossRatePercent, 2.975);
  });

  test("two buyers share the buyer fee equally", () => {
    const result = calculateSideCommission({
      side: "buyer",
      purchasePriceCents: 610_000_00,
      fee: { kind: "percent", netRatePercent: 2.5 },
      payers: [{ key: "a" }, { key: "b" }],
      vatRatePercent: VAT,
    });
    const expected = { line: 9_073_75, discount: 0, gross: 9_073_75, net: 7_625_00, vat: 1_448_75 };
    assert.deepEqual(totals(result), [expected, expected]);
    assert.equal(invoicesOf(result)[0].sideNetCents, 15_250_00);
    assert.equal(invoicesOf(result)[0].sharePercent, 50);
  });

  test("two sellers each get their own discount", () => {
    const result = calculateSideCommission({
      side: "seller",
      purchasePriceCents: 610_000_00,
      fee: { kind: "percent", netRatePercent: 2.5 },
      payers: [
        { key: "a", discountGrossCents: 1_000_00 },
        { key: "b", discountGrossCents: 1_000_00 },
      ],
      vatRatePercent: VAT,
    });
    const expected = {
      line: 9_073_75,
      discount: 1_000_00,
      gross: 8_073_75,
      net: 6_784_66,
      vat: 1_289_09,
    };
    assert.deepEqual(totals(result), [expected, expected]);
  });

  test("a discount for one of two sellers leaves the other invoice whole", () => {
    const result = calculateSideCommission({
      side: "seller",
      purchasePriceCents: 610_000_00,
      fee: { kind: "percent", netRatePercent: 2.5 },
      payers: [{ key: "a", discountGrossCents: 500_00, discountReason: "Kulanz" }, { key: "b" }],
      vatRatePercent: VAT,
    });
    const [first, second] = invoicesOf(result);
    assert.equal(first.discountGrossCents, 500_00);
    assert.equal(first.discountReason, "Kulanz");
    assert.equal(first.totalGrossCents, 9_073_75 - 500_00);
    assert.equal(second.discountGrossCents, 0);
    assert.equal(second.discountReason, null);
    assert.equal(second.totalGrossCents, 9_073_75);
  });

  test("a half cent rounds up on each share", () => {
    const result = calculateSideCommission({
      side: "seller",
      purchasePriceCents: 575_000_00,
      fee: { kind: "percent", netRatePercent: 2.5 },
      payers: [{ key: "a" }, { key: "b" }],
      vatRatePercent: VAT,
    });
    const expected = { line: 8_553_13, discount: 0, gross: 8_553_13, net: 7_187_50, vat: 1_365_63 };
    assert.deepEqual(totals(result), [expected, expected]);
  });
});

describe("deal", () => {
  test("only the seller pays a fixed amount", () => {
    const result = calculateDealCommission({
      purchasePriceCents: null,
      vatRatePercent: VAT,
      seller: { fee: { kind: "fixed", netAmountCents: 5_000_00 }, payers: [{ key: "a" }] },
    });
    const [invoice] = invoicesOf(result);
    assert.equal(invoice.side, "seller");
    assert.equal(invoice.grossRatePercent, null);
    assert.equal(invoice.totalGrossCents, 5_950_00);
  });

  test("both sides produce one invoice per payer", () => {
    const result = calculateDealCommission({
      purchasePriceCents: 300_000_00,
      vatRatePercent: VAT,
      buyer: { fee: { kind: "percent", netRatePercent: 3 }, payers: [{ key: "b1" }] },
      seller: {
        fee: { kind: "percent", netRatePercent: 2 },
        payers: [{ key: "s1" }, { key: "s2" }, { key: "s3" }, { key: "s4" }],
      },
    });
    const invoices = invoicesOf(result);
    assert.equal(invoices.length, 5);
    assert.deepEqual(
      invoices.map((invoice) => invoice.side),
      ["buyer", "seller", "seller", "seller", "seller"],
    );
  });

  test("a deal with no paying side is a problem, not an empty list", () => {
    assert.deepEqual(calculateDealCommission({ purchasePriceCents: 1_00, vatRatePercent: VAT }), {
      ok: false,
      problems: [{ side: null, problem: "no_side_pays" }],
    });
  });

  test("missing data is reported for every side at once", () => {
    const result = calculateDealCommission({
      purchasePriceCents: null,
      vatRatePercent: VAT,
      buyer: { fee: { kind: "percent", netRatePercent: 3 }, payers: [] },
      seller: { fee: null, payers: [{ key: "a" }] },
    });
    assert.deepEqual(result, {
      ok: false,
      problems: [
        { side: "buyer", problem: "purchase_price_missing" },
        { side: "buyer", problem: "no_payers" },
        { side: "seller", problem: "fee_missing" },
      ],
    });
  });
});

describe("shares", () => {
  test("explicit shares must cover every payer", () => {
    const result = calculateSideCommission({
      side: "seller",
      purchasePriceCents: 100_000_00,
      fee: { kind: "percent", netRatePercent: 3 },
      payers: [{ key: "a", sharePercent: 100 }, { key: "b" }],
      vatRatePercent: VAT,
    });
    assert.deepEqual(result, {
      ok: false,
      problems: [{ side: "seller", problem: "shares_incomplete" }],
    });
  });

  test("explicit shares must add up to 100", () => {
    const result = calculateSideCommission({
      side: "seller",
      purchasePriceCents: 100_000_00,
      fee: { kind: "percent", netRatePercent: 3 },
      payers: [
        { key: "a", sharePercent: 60 },
        { key: "b", sharePercent: 30 },
      ],
      vatRatePercent: VAT,
    });
    assert.equal(result.ok, false);
  });

  test("a zero share is refused, so a payer who pays nothing is left off the side", () => {
    const result = calculateSideCommission({
      side: "seller",
      purchasePriceCents: 100_000_00,
      fee: { kind: "percent", netRatePercent: 3 },
      payers: [
        { key: "a", sharePercent: 100 },
        { key: "b", sharePercent: 0 },
      ],
      vatRatePercent: VAT,
    });
    assert.deepEqual(result, {
      ok: false,
      problems: [{ side: "seller", problem: "shares_do_not_add_up" }],
    });
  });

  test("a discount larger than the fee is refused", () => {
    const result = calculateSideCommission({
      side: "buyer",
      purchasePriceCents: 10_000_00,
      fee: { kind: "percent", netRatePercent: 3 },
      payers: [{ key: "a", discountGrossCents: 1_000_00 }],
      vatRatePercent: VAT,
    });
    assert.deepEqual(result, {
      ok: false,
      problems: [{ side: "buyer", problem: "discount_exceeds_fee" }],
    });
  });

  test("odd cents go to the largest remainder and the parts add up", () => {
    const parts = splitByShares(100_01, [100 / 3, 100 / 3, 100 / 3]);
    assert.equal(
      parts.reduce((sum, part) => sum + part, 0),
      100_01,
    );
    assert.deepEqual(parts, [33_34, 33_34, 33_33]);
  });
});
