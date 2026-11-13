import type { ComponentType } from "react";
import { Building2, CheckCircle2, Clock, FileWarning, Wallet } from "lucide-react";

import type { QueueTone } from "@/components/invoice-queue/queue-kpi-card";
import { COMPANY_WITHOUT } from "@/lib/data/format";
import type { DocumentSortKey } from "@/lib/data/types";

export interface QueueCardSpec {
  key: string;
  tone: QueueTone;
  icon: ComponentType<{ className?: string }>;
  to: string;
  search: Record<string, unknown>;
  sort?: DocumentSortKey;
  dir?: "asc" | "desc";
}

/** Every filter key a card owns. Selecting one clears the others so two cards can never look
 *  active at once, and the highlight can be decided by comparing exactly these. */
export const CARD_FILTER_KEYS = [
  "status",
  "company",
  "workflow",
  "payment",
  "paymentType",
  "due",
] as const;

export type NextAction = "review" | "approve" | "pay" | "match" | "none";

export function nextAction(
  row: {
    status?: string | null;
    workflow_status?: string | null;
    paid_at?: string | null;
    has_confirmed_bank_match?: boolean | null;
  },
  // True once an external bookkeeping system (Lexware today) owns payment tracking for this
  // tenant: the Hub never pays or bank-matches an invoice itself any more, so an approved,
  // unpaid document has nothing left for a person to click here -- it is simply waiting on that
  // system, the same way the invoice detail page already hides its own pay/match controls.
  paymentsHandledExternally = false,
): NextAction {
  // "zu_pruefen", "freigegeben_vorgesetzter" and "freigegeben_assistenz" are the same states
  // under their German names, for a client not yet renamed to English.
  if (row.status === "needs_review" || row.status === "zu_pruefen") return "review";
  const isApprovedFinal =
    row.workflow_status === "approved_final" || row.workflow_status === "freigegeben_vorgesetzter";
  if (!row.paid_at && isApprovedFinal) return paymentsHandledExternally ? "none" : "pay";
  if (
    !row.paid_at &&
    (row.workflow_status === "approved_first" || row.workflow_status === "freigegeben_assistenz")
  )
    return "approve";
  if (!row.paid_at && !paymentsHandledExternally && !row.has_confirmed_bank_match) return "match";
  return "none";
}

export const QUEUE_CARDS: QueueCardSpec[] = [
  {
    key: "needs_action",
    tone: "warning",
    icon: FileWarning,
    to: "/incoming-invoices",
    search: { status: "needs_review" },
  },
  {
    key: "missing_assignment",
    tone: "warning",
    icon: Building2,
    to: "/incoming-invoices",
    search: { company: COMPANY_WITHOUT },
  },
  {
    key: "ready_for_payment",
    tone: "success",
    icon: Wallet,
    to: "/incoming-invoices",
    search: { workflow: "approved_final", payment: "open" },
  },
  {
    key: "pay_now",
    tone: "danger",
    icon: Clock,
    to: "/incoming-invoices",
    search: { due: "due_now", payment: "open", paymentType: "transfer" },
    sort: "due",
    dir: "asc",
  },
  {
    key: "completed",
    tone: "neutral",
    icon: CheckCircle2,
    to: "/incoming-invoices",
    search: { payment: "paid" },
  },
];
