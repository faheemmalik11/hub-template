import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MessageCircleQuestion,
  UserCheck,
  XCircle,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  useInvoicesAssignedToMe,
  useInvoicesRejectedToMe,
  useInvoicesReturnedToMe,
  useMeInChain,
  useSuppliers,
} from "@/data";
import { formatEUR } from "@/lib/data/format";
import type { Document } from "@/lib/data/types";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MAX_PREVIEW = 4;

type BucketKey = "abgelehnt" | "rueckfrage" | "zugewiesen";

const BUCKET_STYLE: Record<BucketKey, { icon: typeof XCircle; className: string }> = {
  abgelehnt: {
    icon: XCircle,
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  rueckfrage: {
    icon: MessageCircleQuestion,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-500",
  },
  zugewiesen: { icon: UserCheck, className: "border-border bg-muted/60 text-foreground" },
};

export function HomeAttention() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const me = useMeInChain();

  const rejectedQ = useInvoicesRejectedToMe(me?.id ?? null, me?.name ?? null);
  const returnedQ = useInvoicesReturnedToMe(me?.id ?? null, me?.name ?? null);
  const assignedQ = useInvoicesAssignedToMe(me?.id ?? null);
  const suppliersQ = useSuppliers();
  const supplierName = useMemo(
    () => new Map((suppliersQ.data ?? []).map((supplier) => [supplier.id, supplier.name])),
    [suppliersQ.data],
  );

  const buckets = useMemo(() => {
    const claimed = new Set<string>();
    const ordered: { key: BucketKey; source: Document[] }[] = [
      { key: "abgelehnt", source: rejectedQ.data ?? [] },
      { key: "rueckfrage", source: returnedQ.data ?? [] },
      { key: "zugewiesen", source: assignedQ.data ?? [] },
    ];
    return ordered
      .map(({ key, source }) => ({
        key,
        documents: source.filter((document) => {
          if (claimed.has(document.id)) return false;
          claimed.add(document.id);
          return true;
        }),
      }))
      .filter((bucket) => bucket.documents.length > 0);
  }, [rejectedQ.data, returnedQ.data, assignedQ.data]);

  const total = buckets.reduce((sum, bucket) => sum + bucket.documents.length, 0);
  const preview = useMemo(
    () =>
      buckets
        .flatMap((bucket) => bucket.documents.map((document) => ({ document, bucket: bucket.key })))
        .sort((a, b) => b.document.created_at.localeCompare(a.document.created_at))
        .slice(0, MAX_PREVIEW),
    [buckets],
  );

  const loading = !!me && (rejectedQ.isLoading || returnedQ.isLoading || assignedQ.isLoading);
  const failed = [rejectedQ, returnedQ, assignedQ].some((query) => query.isError);

  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hour = new Date().getHours();
  const partOfDay = hour < 11 ? "Morning" : hour < 18 ? "Day" : "Evening";
  const greeting = firstName
    ? t(`home.attention.greet${partOfDay}`, { name: firstName })
    : t(`home.attention.greet${partOfDay}Anon`);

  if (!me) return null;

  return (
    <section className="mb-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{greeting}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        {!loading && total === 0 && !failed && (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        )}
        <span>
          {loading
            ? t("home.attention.loading")
            : total === 0
              ? t("home.attention.clear")
              : t("home.attention.lead", { count: total })}
        </span>
      </p>

      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        total > 0 && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {buckets.map((bucket) => {
                const { icon: Icon, className } = BUCKET_STYLE[bucket.key];
                return (
                  <span
                    key={bucket.key}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                      className,
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t(`home.attention.bucket.${bucket.key}`, { count: bucket.documents.length })}
                  </span>
                );
              })}
            </div>

            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {preview.map(({ document, bucket }) => (
                <li key={document.id}>
                  <Link
                    to="/incoming-invoices/$nr"
                    params={{ nr: document.id }}
                    className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground sm:truncate">
                        {(document.supplier_id ? supplierName.get(document.supplier_id) : null) ??
                          document.issuer ??
                          t("home.unknownSteller")}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground sm:truncate">
                        {document.invoice_number ?? t("home.ohneNr")} ·{" "}
                        {t(`home.attention.reason.${bucket}`)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {formatEUR(document.amount_gross)}
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground/40" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {total > preview.length && (
              <Link
                to="/incoming-invoices"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-dark underline-offset-4 hover:underline"
              >
                {t("home.attention.more", { count: total - preview.length })}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </>
        )
      )}

      {failed && (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-500">
          <AlertTriangle className="size-3.5" />
          {t("home.attention.error")}
        </p>
      )}
    </section>
  );
}
