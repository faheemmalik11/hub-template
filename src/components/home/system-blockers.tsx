import { Link } from "@tanstack/react-router";
import { AlertTriangle, Ban, CheckCircle2, FileSearch, Timer, WavesArrowDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";

import {
  useBankMatchingCounts,
  useNotMatchableDocuments,
  useOutgoingInvoices,
  useOverviewInvoices,
} from "@/data";
import { todayLocal } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SETTLED_STATUSES = new Set<string>(["draft", "paidoff", "voided", "paid", "cancelled"]);

interface Blocker {
  key: string;
  count: number;
  icon: LucideIcon;
  to: string;
  tone: "warn" | "info";
}

export function SystemBlockers() {
  const { t } = useTranslation();
  const invoicesQ = useOverviewInvoices();
  const outgoingQ = useOutgoingInvoices();
  const bankQ = useBankMatchingCounts();
  const blockedQ = useNotMatchableDocuments();

  const toReview = useMemo(
    () => (invoicesQ.data ?? []).filter((invoice) => invoice.status === "zu_pruefen").length,
    [invoicesQ.data],
  );
  const overdueOutgoing = useMemo(() => {
    const today = todayLocal();
    return (outgoingQ.data ?? []).filter((invoice) => {
      const dueOn = invoice.due_date ?? invoice.expected_payment_on;
      return !SETTLED_STATUSES.has(invoice.status) && !!dueOn && dueOn < today;
    }).length;
  }, [outgoingQ.data]);

  const blockers: Blocker[] = [
    { key: "zuPruefen", count: toReview, icon: FileSearch, to: "/incoming-invoices", tone: "warn" },
    {
      key: "ueberfaellig",
      count: overdueOutgoing,
      icon: Timer,
      to: "/outgoing-invoices",
      tone: "warn",
    },
    {
      key: "ohneBeleg",
      count: bankQ.data?.open ?? 0,
      icon: WavesArrowDown,
      to: "/bank-transactions",
      tone: "info",
    },
    {
      key: "blockiert",
      count: blockedQ.data?.length ?? 0,
      icon: Ban,
      to: "/open-items",
      tone: "info",
    },
  ];

  const active = blockers.filter((blocker) => blocker.count > 0);
  if (invoicesQ.isLoading || outgoingQ.isLoading) return null;

  if (active.length === 0) {
    return (
      <section className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        {t("home.blockers.clear")}
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
        <AlertTriangle className="size-4 text-amber-600" />
        {t("home.blockers.title")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {active.map((blocker) => {
          const Icon = blocker.icon;
          return (
            <Link
              key={blocker.key}
              to={blocker.to}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                blocker.tone === "warn"
                  ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                  : "border-border bg-card hover:border-brand-soft",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  blocker.tone === "warn" ? "text-amber-600" : "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <div className="text-xl font-semibold tabular-nums leading-none text-foreground">
                  {blocker.count}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t(`home.blockers.${blocker.key}`)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
