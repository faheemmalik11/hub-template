import type { ComponentType } from "react";
import { Building2, CheckCircle2, Clock, FileWarning, Wallet } from "lucide-react";

import type { QueueTone } from "@/components/invoice-queue/queue-kpi-card";
import { GESELLSCHAFT_OHNE } from "@/lib/data/format";
import type { BelegSortKey } from "@/lib/data/types";

export interface QueueCardSpec {
  key: string;
  tone: QueueTone;
  icon: ComponentType<{ className?: string }>;
  to: string;
  search: Record<string, unknown>;
  sort?: BelegSortKey;
  dir?: "asc" | "desc";
}

/** Every filter key a card owns. Selecting one clears the others so two cards can never look
 *  active at once, and the highlight can be decided by comparing exactly these. */
export const CARD_FILTER_KEYS = [
  "status",
  "gesellschaft",
  "workflow",
  "zahlung",
  "paymentType",
  "faellig",
] as const;

export type NextAction = "review" | "approve" | "pay" | "match" | "none";

export function nextAction(row: {
  status?: string | null;
  workflow_status?: string | null;
  paid_at?: string | null;
  has_confirmed_bank_match?: boolean | null;
}): NextAction {
  if (row.status === "needs_review") return "review";
  // Only the supervisor step is payable. An invoice approved by the assistant still needs the
  // final approval, and offering "pay" there leads to a dialog whose button is disabled.
  if (!row.paid_at && row.workflow_status === "approved_final") return "pay";
  if (!row.paid_at && row.workflow_status === "approved_first") return "approve";
  if (!row.paid_at && !row.has_confirmed_bank_match) return "match";
  return "none";
}

export const QUEUE_CARDS: QueueCardSpec[] = [
  {
    key: "needs_action",
    tone: "warning",
    icon: FileWarning,
    to: "/eingangsrechnungen",
    search: { status: "needs_review" },
  },
  {
    key: "missing_assignment",
    tone: "warning",
    icon: Building2,
    to: "/eingangsrechnungen",
    search: { gesellschaft: GESELLSCHAFT_OHNE },
  },
  {
    key: "ready_for_payment",
    tone: "success",
    icon: Wallet,
    to: "/eingangsrechnungen",
    search: { workflow: "approved_final", zahlung: "open" },
  },
  {
    key: "pay_now",
    tone: "danger",
    icon: Clock,
    to: "/eingangsrechnungen",
    search: { faellig: "due_now", zahlung: "open", paymentType: "transfer" },
    sort: "faellig",
    dir: "asc",
  },
  {
    key: "completed",
    tone: "neutral",
    icon: CheckCircle2,
    to: "/eingangsrechnungen",
    search: { zahlung: "paid" },
  },
];
