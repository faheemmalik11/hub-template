import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
import {
  BONUS_TYPES,
  useBrokerBonuses,
  useDeleteBrokerBonus,
  useReviewBrokerBonus,
  useSubmitBrokerBonus,
  type BonusStatus,
  type BonusType,
  type BrokerBonus,
} from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
import { errorText, formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/broker-bonuses/")({
  head: () => ({ meta: [{ title: pageTitle("Boni") }] }),
  staticData: { titleKey: "brokerBonuses" },
  component: BrokerBonusesPage,
});

const STATUS_VARIANT: Record<BonusStatus, "default" | "secondary" | "outline"> = {
  submitted: "secondary",
  approved: "default",
  paid: "outline",
  rejected: "outline",
};

const PAYROLL_CUTOFF_DAY = 15;

function payrollMonthOf(submittedAt: string): string {
  const submitted = new Date(submittedAt);
  const month = new Date(
    submitted.getFullYear(),
    submitted.getMonth() + (submitted.getDate() > PAYROLL_CUTOFF_DAY ? 1 : 0),
    1,
  );
  return month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function BrokerBonusesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canReview = can(PERMISSIONS.bonusesReview);
  const canSubmit = can(PERMISSIONS.bonusesSubmit);
  const bonusesQ = useBrokerBonuses();
  const bonuses = useMemo(() => bonusesQ.data ?? [], [bonusesQ.data]);
  const [reviewing, setReviewing] = useState<BrokerBonus | null>(null);
  const markPaid = useReviewBrokerBonus();
  const remove = useDeleteBrokerBonus();

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
            {canReview ? t("brokerBonuses.subtitleReview") : t("brokerBonuses.subtitle")}
          </p>
        </div>
        {canSubmit && <NewBonusDialog />}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {(["submitted", "approved", "paid"] as const).map((status) => (
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
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("brokerBonuses.columns.date")}</TableHead>
                  {canReview && <TableHead>{t("brokerBonuses.columns.broker")}</TableHead>}
                  <TableHead>{t("brokerBonuses.columns.type")}</TableHead>
                  <TableHead className="text-right">{t("brokerBonuses.columns.amount")}</TableHead>
                  <TableHead>{t("brokerBonuses.columns.payrollMonth")}</TableHead>
                  <TableHead>{t("brokerBonuses.columns.status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bonuses.map((bonus) => (
                  <TableRow key={bonus.id}>
                    <TableCell className="text-sm">{formatDate(bonus.earned_on)}</TableCell>
                    {canReview && (
                      <TableCell className="text-sm">
                        {bonus.broker?.name ?? bonus.broker?.email ?? "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="text-sm font-medium">
                        {t(`brokerBonuses.types.${bonus.bonus_type}`)}
                      </div>
                      {bonus.note && (
                        <div className="text-xs text-muted-foreground">{bonus.note}</div>
                      )}
                      {bonus.review_note && (
                        <div className="text-xs text-muted-foreground">
                          {t("brokerBonuses.reviewNote", { note: bonus.review_note })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEUR(bonus.amount)}
                    </TableCell>
                    <TableCell className="text-sm">{payrollMonthOf(bonus.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[bonus.status]} className="whitespace-nowrap">
                        {t(`brokerBonuses.status.${bonus.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
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
                        {canSubmit && bonus.status === "submitted" && (
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
                            {t("brokerBonuses.withdraw")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("brokerBonuses.newDialog.notePlaceholder")}
              />
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
              onChange={(event) => setReviewNote(event.target.value)}
            />
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
