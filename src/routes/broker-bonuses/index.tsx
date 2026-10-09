import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { BonusSettingsDialog } from "@/components/broker-bonuses/bonus-settings-dialog";
import { ExpandableNote } from "@/components/broker-bonuses/expandable-note";
import {
  BONUS_NOTE_MAX_LENGTH,
  BONUS_TYPES,
  useBrokerBonuses,
  useConfirmSuggestedBonus,
  useDeleteBrokerBonus,
  useReviewBrokerBonus,
  useSubmitBrokerBonus,
  type BonusStatus,
  type BonusType,
  type BrokerBonus,
} from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { pageTitle } from "@/config/brand";
import { downloadTextFile, toCsv } from "@/kit/lib/download";
import { TablePagination } from "@/kit/components/feedback/table-pagination";
import { useFeature } from "@/data/use-feature";
import { useAuth } from "@/lib/auth";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { useTableView } from "@/lib/use-table-view";
import { errorText, formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/broker-bonuses/")({
  head: () => ({ meta: [{ title: pageTitle("Boni") }] }),
  staticData: { titleKey: "brokerBonuses" },
  component: BrokerBonusesPage,
});

const STATUS_VARIANT: Record<BonusStatus, "default" | "secondary" | "outline"> = {
  suggested: "outline",
  submitted: "secondary",
  approved: "default",
  paid: "outline",
  rejected: "outline",
};

const PAYROLL_CUTOFF_DAY = 15;

function payrollMonthOf(submittedAt: string, language: string): string {
  const submitted = new Date(submittedAt);
  const month = new Date(
    submitted.getFullYear(),
    submitted.getMonth() + (submitted.getDate() > PAYROLL_CUTOFF_DAY ? 1 : 0),
    1,
  );
  return month.toLocaleDateString(language, { month: "long", year: "numeric" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function BrokerBonusesPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { can } = useAuth();
  const canReview = can(PERMISSIONS.bonusesReview);
  const canSubmit = can(PERMISSIONS.bonusesSubmit);
  const seesAllBrokers = canReview || can(PERMISSIONS.bonusesRead);
  const bonusesQ = useBrokerBonuses();
  const bonuses = useMemo(() => bonusesQ.data ?? [], [bonusesQ.data]);
  const view = useTableView(bonuses, {
    sortValue: (bonus) => bonus.earned_on,
    initialSort: "earned",
    initialDir: "desc",
  });
  const paginationLabels = usePaginationLabels();
  const [reviewing, setReviewing] = useState<BrokerBonus | null>(null);
  const markPaid = useReviewBrokerBonus();
  const remove = useDeleteBrokerBonus();
  const confirmSuggested = useConfirmSuggestedBonus();
  const suggestsBonuses = useFeature(PERMISSIONS.bonusesSuggest);

  const exportApproved = () => {
    const approvedOrPaid = bonuses.filter(
      (bonus) => bonus.status === "approved" || bonus.status === "paid",
    );
    const header = ["payrollMonth", "broker", "date", "type", "amount", "status"].map((key) =>
      t(`brokerBonuses.export.${key}`),
    );
    const rows = approvedOrPaid.map((bonus) => [
      payrollMonthOf(bonus.created_at, language),
      bonus.broker?.name ?? bonus.broker?.email ?? "",
      formatDate(bonus.earned_on),
      t(`brokerBonuses.types.${bonus.bonus_type}`),
      String(bonus.amount).replace(".", ","),
      t(`brokerBonuses.status.${bonus.status}`),
    ]);
    downloadTextFile(`${t("brokerBonuses.export.fileName")}.csv`, toCsv([header, ...rows]));
  };

  const totalOf = (status: BonusStatus) =>
    bonuses
      .filter((bonus) => bonus.status === status)
      .reduce((sum, bonus) => sum + bonus.amount, 0);

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("brokerBonuses.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {canReview
              ? t("brokerBonuses.subtitleReview")
              : seesAllBrokers
                ? t("brokerBonuses.subtitlePayroll")
                : t("brokerBonuses.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {seesAllBrokers && (
            <Button variant="outline" onClick={exportApproved}>
              <Download /> {t("brokerBonuses.export.button")}
            </Button>
          )}
          {canReview && suggestsBonuses && <BonusSettingsDialog />}
          {canSubmit && <NewBonusDialog />}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {(canReview
          ? (["submitted", "approved", "paid"] as const)
          : (["approved", "paid"] as const)
        ).map((status) => (
          <div key={status} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t(`brokerBonuses.totals.${status}`)}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(totalOf(status))}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("brokerBonuses.cutoffHint", { day: PAYROLL_CUTOFF_DAY })}
      </p>

      <div className="mt-4">
        {bonusesQ.isLoading ? (
          <TableSkeleton cols={6} />
        ) : bonusesQ.error ? (
          <ErrorState error={bonusesQ.error} onRetry={() => bonusesQ.refetch()} />
        ) : bonuses.length === 0 ? (
          <EmptyState title={t("brokerBonuses.emptyTitle")} hint={t("brokerBonuses.emptyHint")} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("brokerBonuses.columns.date")}</TableHead>
                    {seesAllBrokers && <TableHead>{t("brokerBonuses.columns.broker")}</TableHead>}
                    <TableHead>{t("brokerBonuses.columns.type")}</TableHead>
                    <TableHead className="text-right">
                      {t("brokerBonuses.columns.amount")}
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      {t("brokerBonuses.columns.payrollMonth")}
                    </TableHead>
                    <TableHead>{t("brokerBonuses.columns.status")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.pageRows.map((bonus) => (
                    <TableRow key={bonus.id}>
                      <TableCell className="align-top text-sm whitespace-nowrap">
                        {formatDate(bonus.earned_on)}
                      </TableCell>
                      {seesAllBrokers && (
                        <TableCell className="align-top text-sm whitespace-nowrap">
                          {bonus.broker?.name ?? bonus.broker?.email ?? "—"}
                        </TableCell>
                      )}
                      <TableCell className="align-top">
                        <div className="text-sm font-medium">
                          {t(`brokerBonuses.types.${bonus.bonus_type}`)}
                        </div>
                        {bonus.deal_id && (
                          <Link
                            to="/commission-deals/$id"
                            params={{ id: bonus.deal_id }}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            {t("brokerBonuses.fromDeal")}
                          </Link>
                        )}
                        {bonus.note && <ExpandableNote text={bonus.note} />}
                        {bonus.review_note && (
                          <ExpandableNote
                            text={t("brokerBonuses.reviewNote", { note: bonus.review_note })}
                          />
                        )}
                      </TableCell>
                      <TableCell className="align-top text-right tabular-nums whitespace-nowrap">
                        {formatEUR(bonus.amount)}
                      </TableCell>
                      <TableCell className="align-top text-sm whitespace-nowrap">
                        {payrollMonthOf(bonus.created_at, language)}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={STATUS_VARIANT[bonus.status]} className="whitespace-nowrap">
                          {t(`brokerBonuses.status.${bonus.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <div className="flex justify-end gap-2">
                          {canReview && bonus.status === "submitted" && (
                            <Button size="sm" onClick={() => setReviewing(bonus)}>
                              {t("brokerBonuses.review")}
                            </Button>
                          )}
                          {canReview && bonus.status === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markPaid.isPending}
                              onClick={() =>
                                markPaid.mutate(
                                  { id: bonus.id, status: "paid" },
                                  {
                                    onError: (error) =>
                                      toast.error(t("brokerBonuses.failed"), {
                                        description: errorText(error),
                                      }),
                                  },
                                )
                              }
                            >
                              {t("brokerBonuses.markPaid")}
                            </Button>
                          )}
                          {canSubmit && bonus.status === "suggested" && (
                            <Button
                              size="sm"
                              disabled={confirmSuggested.isPending}
                              onClick={() =>
                                confirmSuggested.mutate(bonus.id, {
                                  onError: (error) =>
                                    toast.error(t("brokerBonuses.failed"), {
                                      description: errorText(error),
                                    }),
                                })
                              }
                            >
                              {t("brokerBonuses.confirm")}
                            </Button>
                          )}
                          {canSubmit &&
                            (bonus.status === "submitted" || bonus.status === "suggested") && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={remove.isPending}
                                onClick={() =>
                                  remove.mutate(bonus.id, {
                                    onError: (error) =>
                                      toast.error(t("brokerBonuses.failed"), {
                                        description: errorText(error),
                                      }),
                                  })
                                }
                              >
                                {bonus.status === "suggested"
                                  ? t("brokerBonuses.decline")
                                  : t("brokerBonuses.withdraw")}
                              </Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3">
              <TablePagination
                page={view.page}
                totalPages={view.totalPages}
                pageSize={view.pageSize}
                total={view.total}
                from={view.from}
                to={view.to}
                onPage={view.setPage}
                onPageSize={view.setPageSize}
                labels={paginationLabels}
                divider={false}
              />
            </div>
          </>
        )}
      </div>

      <ReviewDialog bonus={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}

function NewBonusDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [earnedOn, setEarnedOn] = useState(todayIso());
  const [bonusType, setBonusType] = useState<BonusType | "">("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const submit = useSubmitBrokerBonus();
  const parsedAmount = Number(amount.replace(",", "."));
  const canSave = Boolean(earnedOn && bonusType && parsedAmount > 0);

  const save = () => {
    if (!bonusType) return;
    submit.mutate(
      { bonusType, earnedOn, amount: parsedAmount, note: note.trim() || null },
      {
        onSuccess: () => {
          setOpen(false);
          setBonusType("");
          setAmount("");
          setNote("");
          setEarnedOn(todayIso());
          toast.success(t("brokerBonuses.newDialog.saved"));
        },
        onError: (error) =>
          toast.error(t("brokerBonuses.newDialog.failed"), { description: errorText(error) }),
      },
    );
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {t("brokerBonuses.newBonus")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("brokerBonuses.newDialog.title")}</DialogTitle>
            <DialogDescription>{t("brokerBonuses.newDialog.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bonus-date">{t("brokerBonuses.newDialog.date")}</Label>
              <Input
                id="bonus-date"
                type="date"
                value={earnedOn}
                onChange={(event) => setEarnedOn(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("brokerBonuses.newDialog.type")}</Label>
              <Select value={bonusType} onValueChange={(value) => setBonusType(value as BonusType)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("brokerBonuses.newDialog.typePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {BONUS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`brokerBonuses.types.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus-amount">{t("brokerBonuses.newDialog.amount")}</Label>
              <Input
                id="bonus-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus-note">{t("brokerBonuses.newDialog.note")}</Label>
              <Textarea
                id="bonus-note"
                value={note}
                maxLength={BONUS_NOTE_MAX_LENGTH}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("brokerBonuses.newDialog.notePlaceholder")}
              />
              <p className="text-right text-xs text-muted-foreground">
                {note.length} / {BONUS_NOTE_MAX_LENGTH}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("brokerBonuses.newDialog.cancel")}
            </Button>
            <Button onClick={save} disabled={!canSave || submit.isPending}>
              {t("brokerBonuses.newDialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewDialog({ bonus, onClose }: { bonus: BrokerBonus | null; onClose: () => void }) {
  const { t } = useTranslation();
  const review = useReviewBrokerBonus();
  const [amount, setAmount] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [shownId, setShownId] = useState<string | null>(null);

  if (bonus && bonus.id !== shownId) {
    setShownId(bonus.id);
    setAmount(String(bonus.amount).replace(".", ","));
    setReviewNote("");
  }

  const parsedAmount = Number(amount.replace(",", "."));
  const decide = (status: "approved" | "rejected") => {
    if (!bonus) return;
    review.mutate(
      {
        id: bonus.id,
        status,
        amount: parsedAmount > 0 ? parsedAmount : bonus.amount,
        reviewNote: reviewNote.trim() || null,
      },
      {
        onSuccess: onClose,
        onError: (error) =>
          toast.error(t("brokerBonuses.failed"), { description: errorText(error) }),
      },
    );
  };

  return (
    <Dialog open={bonus !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("brokerBonuses.reviewDialog.title")}</DialogTitle>
          <DialogDescription>
            {bonus
              ? t("brokerBonuses.reviewDialog.desc", {
                  broker: bonus.broker?.name ?? bonus.broker?.email ?? "",
                  type: t(`brokerBonuses.types.${bonus.bonus_type}`),
                  date: formatDate(bonus.earned_on),
                })
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="review-amount">{t("brokerBonuses.reviewDialog.amount")}</Label>
            <Input
              id="review-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-note">{t("brokerBonuses.reviewDialog.note")}</Label>
            <Textarea
              id="review-note"
              value={reviewNote}
              maxLength={BONUS_NOTE_MAX_LENGTH}
              onChange={(event) => setReviewNote(event.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {reviewNote.length} / {BONUS_NOTE_MAX_LENGTH}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={review.isPending} onClick={() => decide("rejected")}>
            {t("brokerBonuses.reviewDialog.reject")}
          </Button>
          <Button disabled={review.isPending} onClick={() => decide("approved")}>
            {t("brokerBonuses.reviewDialog.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
