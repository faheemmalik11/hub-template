import { useMemo, useState } from "react";
import { toast } from "sonner";

import { readableErrorMessage } from "../feedback/query-states";
import { VALIDATION_GATES, type ValidationGateKey } from "../invoice-review/review";
import {
  allChecked,
  allCheckedEntry,
  tickedKeys,
  tickEntry,
  type TickHistoryRow,
  type TickItem,
} from "../../lib/check-ticks";
import {
  allReceiptChecks,
  type CheckStatus,
  type CheckSureness,
  type CompanyForReceiptChecks,
  type ReceiptAccountForChecks,
  type ReceiptCheckKey,
} from "../../lib/receipt-checks";
import { Button, Checkbox, Tooltip, TooltipContent, TooltipTrigger } from "../../ui";
import { cn } from "../../lib/class-names";

const DOT: Record<CheckStatus, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-400",
  fail: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

function gateStatus(value: boolean | null | undefined): CheckStatus {
  if (value === true) return "ok";
  if (value === false) return "fail";
  return "unknown";
}

function StatusDot({ status }: { status: CheckStatus }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT[status])} />;
}

export interface FrontChecklistGate {
  key: ValidationGateKey;
  label: string;
  hint: string;
  value: boolean | null | undefined;
}

export interface FrontChecklistDocument {
  recipientName: string | null;
  recipientAddress: string | null;
  company: CompanyForReceiptChecks | null;
  propertyCode: string | null;
  companyCodesOfProperty: string[];
  accounts: ReceiptAccountForChecks[];
  supplierKnownFlag: boolean | null | undefined;
  hasSupplier: boolean;
}

export interface FrontChecklistHistoryEntry {
  type: string;
  text: string;
  data: Record<string, unknown>;
}

export interface FrontChecklistLabels {
  title: string;
  smallAmountBadge: string;
  smallAmountHint: string;
  automaticSectionTitle: string;
  manualSectionTitle: string;
  progress: (done: number, total: number) => string;
  allCheckedBy: (actor: string, occurredAtFormatted: string) => string;
  markAllChecked: string;
  gateStatusText: (status: CheckStatus) => string;
  checkLabel: (key: ReceiptCheckKey) => string;
  checkReasonText: (key: ReceiptCheckKey, reason: string, params: Record<string, string>) => string;
  suretyText: (sureness: CheckSureness) => string;
  tickFailed: (reason: string) => string;
}

export function FrontChecklist({
  gates,
  document,
  history,
  lastAllChecked,
  smallAmount,
  onTick,
  onAllChecked,
  labels,
}: {
  gates: FrontChecklistGate[];
  document: FrontChecklistDocument;
  history: TickHistoryRow[];
  lastAllChecked?: { actor: string | null; occurredAtFormatted: string } | null;
  smallAmount?: boolean;
  onTick: (entry: FrontChecklistHistoryEntry) => Promise<void>;
  onAllChecked: (entry: FrontChecklistHistoryEntry) => Promise<void>;
  labels: FrontChecklistLabels;
}) {
  const [saving, setSaving] = useState(false);

  const checks = useMemo(
    () =>
      allReceiptChecks({
        recipientName: document.recipientName,
        recipientAddress: document.recipientAddress,
        company: document.company,
        propertyCode: document.propertyCode,
        companyCodesOfProperty: document.companyCodesOfProperty,
        accounts: document.accounts,
        supplierKnownFlag: document.supplierKnownFlag,
        hasSupplier: document.hasSupplier,
      }),
    [document],
  );

  const items: TickItem[] = checks.map((check) => ({
    key: `check:${check.key}`,
    status: check.status,
  }));
  const ticked = tickedKeys(items, history);
  const everythingChecked = allChecked(items, ticked);

  async function writeTick(item: TickItem, isTicked: boolean) {
    setSaving(true);
    try {
      const entry = tickEntry(item, isTicked);
      await onTick({ ...entry, text: `${isTicked ? "Checked" : "Unchecked"}: ${item.key}` });
    } catch (error) {
      toast.error(labels.tickFailed(readableErrorMessage(error, "")));
    } finally {
      setSaving(false);
    }
  }

  async function writeAllChecked() {
    setSaving(true);
    try {
      const entry = allCheckedEntry(items);
      await onAllChecked({ ...entry, text: `All checks confirmed (${items.length})` });
    } catch (error) {
      toast.error(labels.tickFailed(readableErrorMessage(error, "")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-foreground">
          {labels.title}
        </h2>
        {smallAmount && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {labels.smallAmountBadge}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{labels.smallAmountHint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="space-y-4 bg-card p-5">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {labels.automaticSectionTitle}
          </h3>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm text-foreground sm:grid-cols-2">
            {VALIDATION_GATES.map((key) => {
              const gate = gates.find((candidate) => candidate.key === key);
              if (!gate) return null;
              const status = gateStatus(gate.value);
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <li className="inline-flex w-fit items-center gap-1.5">
                      <StatusDot status={status} />
                      <span className={cn(status === "fail" && "text-red-700")}>{gate.label}</span>
                    </li>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {`${gate.hint}: ${labels.gateStatusText(status)}`}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </ul>
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{labels.manualSectionTitle}</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {labels.progress(ticked.size, items.length)}
              </span>
              {everythingChecked && lastAllChecked && (
                <span className="text-xs text-muted-foreground">
                  {labels.allCheckedBy(
                    lastAllChecked.actor ?? "?",
                    lastAllChecked.occurredAtFormatted,
                  )}
                </span>
              )}
              <Button size="sm" onClick={writeAllChecked} disabled={saving || everythingChecked}>
                {labels.markAllChecked}
              </Button>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {checks.map((check) => {
              const item = { key: `check:${check.key}`, status: check.status };
              const label = labels.checkLabel(check.key);
              const checkboxId = `front-check-${check.key}`;
              return (
                <Tooltip key={check.key}>
                  <TooltipTrigger asChild>
                    <li className="flex w-fit items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={ticked.has(item.key)}
                        disabled={saving}
                        onCheckedChange={(value) => writeTick(item, value === true)}
                      />
                      <label htmlFor={checkboxId} className="cursor-pointer text-foreground">
                        {label}
                      </label>
                    </li>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {`${labels.checkReasonText(check.key, check.reason, check.params)} ${labels.suretyText(check.sureness)}`}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

export const englishFrontChecklistLabels: FrontChecklistLabels = {
  title: "Validation result",
  smallAmountBadge: "Small amount, 250 euros or less",
  smallAmountHint: "A gross amount of 250 euros or less does not need an invoice number or date.",
  automaticSectionTitle: "Checked automatically",
  manualSectionTitle: "Check by hand",
  progress: (done, total) => `${done} of ${total} done`,
  allCheckedBy: (actor, occurredAtFormatted) => `Checked by ${actor} on ${occurredAtFormatted}`,
  markAllChecked: "Mark everything as checked",
  gateStatusText: (status) =>
    status === "ok" ? "Passed" : status === "fail" ? "Failed" : "Not checked yet",
  checkLabel: (key) =>
    ({
      recipientAddress: "Recipient address matches the company",
      companySpelling: "Company name is spelled correctly",
      serviceFitsCompany: "The service fits the company",
      iban: "IBAN is known for this supplier",
    })[key],
  checkReasonText: (_key, reason) => reason,
  suretyText: (sureness) =>
    sureness === "high" ? "Sure." : sureness === "medium" ? "Fairly sure." : "Not sure.",
  tickFailed: (reason) => `Could not save. ${reason}`,
};
