import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCancelDonation,
  useDealDonation,
  useDonationSettings,
  useMarkDonationPaid,
  useSuggestDonation,
} from "@/data";
import type { Deal } from "@/data";
import { errorText, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export function DealDonationCard({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const settingsQ = useDonationSettings();
  const donationQ = useDealDonation(deal.id);
  const suggest = useSuggestDonation(deal.id);
  const markPaid = useMarkDonationPaid(deal.id);
  const cancel = useCancelDonation(deal.id);

  const [organisation, setOrganisation] = useState("");
  const [amount, setAmount] = useState("");
  const [iban, setIban] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactReachability, setContactReachability] = useState("");
  const [handoverDate, setHandoverDate] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  if (!settingsQ.data || donationQ.data === undefined) return null;
  if (deal.purchase_price === null || deal.purchase_price < settingsQ.data.threshold_amount) {
    return null;
  }

  const donation = donationQ.data;

  const create = () => {
    const parsedAmount = Number(amount.replace(",", "."));
    if (!organisation.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    suggest.mutate(
      {
        organisation: organisation.trim(),
        amount: parsedAmount,
        iban: iban.trim() || null,
        contactPerson: contactPerson.trim() || null,
        contactReachability: contactReachability.trim() || null,
        handoverDate: handoverDate || null,
      },
      {
        onSuccess: () => toast.success(t("commissionDeals.donation.created")),
        onError: (error) =>
          toast.error(t("commissionDeals.donation.failed"), { description: errorText(error) }),
      },
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">
        {t("commissionDeals.donation.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("commissionDeals.donation.hint", { amount: formatEUR(settingsQ.data.threshold_amount) })}
      </p>

      {!donation ? (
        <div className="mt-3 space-y-2">
          <Input
            value={organisation}
            onChange={(event) => setOrganisation(event.target.value)}
            placeholder={t("commissionDeals.donation.organisation")}
            aria-label={t("commissionDeals.donation.organisation")}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-32"
              inputMode="decimal"
              value={amount || String(settingsQ.data.donation_amount)}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={t("commissionDeals.donation.amount")}
              aria-label={t("commissionDeals.donation.amount")}
            />
            <Input
              className="min-w-48 flex-1"
              value={iban}
              onChange={(event) => setIban(event.target.value)}
              placeholder={t("commissionDeals.donation.iban")}
              aria-label={t("commissionDeals.donation.iban")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-48 flex-1"
              value={contactPerson}
              onChange={(event) => setContactPerson(event.target.value)}
              placeholder={t("commissionDeals.donation.contactPerson")}
              aria-label={t("commissionDeals.donation.contactPerson")}
            />
            <Input
              className="min-w-48 flex-1"
              value={contactReachability}
              onChange={(event) => setContactReachability(event.target.value)}
              placeholder={t("commissionDeals.donation.contactReachability")}
              aria-label={t("commissionDeals.donation.contactReachability")}
            />
            <Input
              className="w-40"
              type="date"
              value={handoverDate}
              onChange={(event) => setHandoverDate(event.target.value)}
              aria-label={t("commissionDeals.donation.handoverDate")}
            />
          </div>
          <Button size="sm" disabled={suggest.isPending} onClick={create}>
            {t("commissionDeals.donation.create")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{donation.organisation}</div>
              <div className="text-xs text-muted-foreground">
                {[donation.contact_person, donation.contact_reachability]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">
                {formatEUR(donation.amount)}
              </div>
              <Badge variant={donation.status === "paid" ? "outline" : "secondary"}>
                {t(`commissionDeals.donation.status.${donation.status}`)}
              </Badge>
            </div>
          </div>
          {donation.status === "suggested" && !cancelling && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={markPaid.isPending}
                onClick={() =>
                  markPaid.mutate(donation.id, {
                    onSuccess: () => toast.success(t("commissionDeals.donation.markedPaid")),
                    onError: (error) =>
                      toast.error(t("commissionDeals.donation.failed"), {
                        description: errorText(error),
                      }),
                  })
                }
              >
                {t("commissionDeals.donation.markPaid")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>
                {t("commissionDeals.donation.cancel")}
              </Button>
            </div>
          )}
          {donation.status === "suggested" && cancelling && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                className="min-w-48 flex-1"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder={t("commissionDeals.donation.cancelReason")}
                aria-label={t("commissionDeals.donation.cancelReason")}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate(
                    { id: donation.id, reason: cancelReason.trim() || null },
                    {
                      onSuccess: () => setCancelling(false),
                      onError: (error) =>
                        toast.error(t("commissionDeals.donation.failed"), {
                          description: errorText(error),
                        }),
                    },
                  )
                }
              >
                {t("commissionDeals.donation.confirmCancel")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                {t("commissionDeals.donation.keepCancel")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
