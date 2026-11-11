import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseDecimal } from "@/components/commission/deal-form";
import { useBonusSettings, useSaveBonusSettings } from "@/data";
import type {
  BonusSettings,
  ReferrerPayoutTiming,
  ReferrerTierCountsStatus,
  ReferrerTierReset,
  ReferrerTierScope,
} from "@/data";
import { errorText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

type NumberKey = Exclude<
  keyof BonusSettings,
  | "company_lead_deducts_costs"
  | "referrer_tier_counts_status"
  | "referrer_tier_reset"
  | "referrer_tier_scope"
  | "referrer_payout_timing"
>;

const NUMBER_FIELDS: NumberKey[] = [
  "notary_amount",
  "follow_up_amount",
  "own_lead_share_percent",
  "company_lead_share_percent",
  "personnel_flat_amount",
  "referrer_tier1_amount",
  "referrer_tier2_amount",
  "referrer_tier3_amount",
  "referrer_tier4plus_amount",
];

const REFERRER_TIER_COUNTS_STATUS_OPTIONS: ReferrerTierCountsStatus[] = ["suggested", "paid"];
const REFERRER_TIER_RESET_OPTIONS: ReferrerTierReset[] = ["yearly", "never"];
const REFERRER_TIER_SCOPE_OPTIONS: ReferrerTierScope[] = ["per_referrer", "company_wide"];
const REFERRER_PAYOUT_TIMING_OPTIONS: ReferrerPayoutTiming[] = [
  "on_suggestion",
  "after_commission_paid",
];

function useRulesOpenParam(): [boolean, (next: boolean) => void] {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { rules?: unknown };
  const open = search.rules === "open";
  const setOpen = (next: boolean) => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const { rules: _rules, ...rest } = prev;
        return next ? { ...rest, rules: "open" } : rest;
      },
      replace: true,
      resetScroll: false,
    });
  };
  return [open, setOpen];
}

export function BonusSettingsDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useRulesOpenParam();
  const settingsQ = useBonusSettings(open);
  const save = useSaveBonusSettings();
  const [typed, setTyped] = useState<Partial<Record<NumberKey, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<NumberKey, boolean>>>({});
  const [deductsCosts, setDeductsCosts] = useState<boolean | null>(null);
  const [countsStatus, setCountsStatus] = useState<ReferrerTierCountsStatus | null>(null);
  const [tierReset, setTierReset] = useState<ReferrerTierReset | null>(null);
  const [tierScope, setTierScope] = useState<ReferrerTierScope | null>(null);
  const [payoutTiming, setPayoutTiming] = useState<ReferrerPayoutTiming | null>(null);
  const settings = settingsQ.data;

  useEffect(() => {
    if (!open) return;
    setTyped({});
    setTouched({});
    setDeductsCosts(null);
    setCountsStatus(null);
    setTierReset(null);
    setTierScope(null);
    setPayoutTiming(null);
  }, [open]);

  const valueOf = (key: NumberKey) => typed[key] ?? String(settings?.[key] ?? "").replace(".", ",");
  const errorFor = (key: NumberKey): string | null => {
    if (!touched[key]) return null;
    const parsed = parseDecimal(valueOf(key));
    if (parsed === null) return t("brokerBonuses.settings.invalidNumber");
    if (parsed < 0) return t("brokerBonuses.settings.invalidNegative");
    return null;
  };
  const hasErrors = NUMBER_FIELDS.some((key) => {
    const parsed = parseDecimal(valueOf(key));
    return parsed === null || parsed < 0;
  });
  const isDirty =
    !!settings &&
    (NUMBER_FIELDS.some((key) => parseDecimal(valueOf(key)) !== settings[key]) ||
      (deductsCosts !== null && deductsCosts !== settings.company_lead_deducts_costs) ||
      (countsStatus !== null && countsStatus !== settings.referrer_tier_counts_status) ||
      (tierReset !== null && tierReset !== settings.referrer_tier_reset) ||
      (tierScope !== null && tierScope !== settings.referrer_tier_scope) ||
      (payoutTiming !== null && payoutTiming !== settings.referrer_payout_timing));

  const submit = () => {
    if (!settings) return;
    const next = {
      ...settings,
      company_lead_deducts_costs: deductsCosts ?? settings.company_lead_deducts_costs,
      referrer_tier_counts_status: countsStatus ?? settings.referrer_tier_counts_status,
      referrer_tier_reset: tierReset ?? settings.referrer_tier_reset,
      referrer_tier_scope: tierScope ?? settings.referrer_tier_scope,
      referrer_payout_timing: payoutTiming ?? settings.referrer_payout_timing,
    };
    for (const key of NUMBER_FIELDS) {
      const value = parseDecimal(valueOf(key));
      if (value === null || value < 0) {
        setTouched((current) => ({ ...current, [key]: true }));
        return toast.error(t("brokerBonuses.settings.invalid"));
      }
      next[key] = value;
    }
    save.mutate(next, {
      onSuccess: () => {
        toast.success(t("brokerBonuses.settings.saved"));
        setOpen(false);
      },
      onError: (error) => toast.error(t("brokerBonuses.failed"), { description: errorText(error) }),
    });
  };

  return (
    <>
      <Button variant="outline" className="shadow-none" onClick={() => setOpen(true)}>
        <Settings2 /> {t("brokerBonuses.settings.button")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{t("brokerBonuses.settings.title")}</SheetTitle>
            <SheetDescription>{t("brokerBonuses.settings.desc")}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {NUMBER_FIELDS.map((key) => {
                const error = errorFor(key);
                return (
                  <div key={key} className="space-y-1.5">
                    <Label>{t(`brokerBonuses.settings.${key}`)}</Label>
                    <Input
                      inputMode="decimal"
                      value={valueOf(key)}
                      onChange={(event) => setTyped({ ...typed, [key]: event.target.value })}
                      onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
                      aria-invalid={error ? true : undefined}
                      className={error ? "border-destructive" : undefined}
                      disabled={!settings}
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                  </div>
                );
              })}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={deductsCosts ?? settings?.company_lead_deducts_costs ?? true}
                onCheckedChange={(checked) => setDeductsCosts(checked === true)}
                disabled={!settings}
              />
              <span>{t("brokerBonuses.settings.company_lead_deducts_costs")}</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("brokerBonuses.settings.referrer_tier_counts_status")}</Label>
                <Select
                  value={countsStatus ?? settings?.referrer_tier_counts_status}
                  onValueChange={(value) => setCountsStatus(value as ReferrerTierCountsStatus)}
                  disabled={!settings}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRER_TIER_COUNTS_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`brokerBonuses.settings.referrerTierCountsStatus.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("brokerBonuses.settings.referrer_tier_reset")}</Label>
                <Select
                  value={tierReset ?? settings?.referrer_tier_reset}
                  onValueChange={(value) => setTierReset(value as ReferrerTierReset)}
                  disabled={!settings}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRER_TIER_RESET_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`brokerBonuses.settings.referrerTierReset.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("brokerBonuses.settings.referrer_tier_scope")}</Label>
                <Select
                  value={tierScope ?? settings?.referrer_tier_scope}
                  onValueChange={(value) => setTierScope(value as ReferrerTierScope)}
                  disabled={!settings}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRER_TIER_SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`brokerBonuses.settings.referrerTierScope.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("brokerBonuses.settings.referrer_payout_timing")}</Label>
                <Select
                  value={payoutTiming ?? settings?.referrer_payout_timing}
                  onValueChange={(value) => setPayoutTiming(value as ReferrerPayoutTiming)}
                  disabled={!settings}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRER_PAYOUT_TIMING_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`brokerBonuses.settings.referrerPayoutTiming.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <SheetFooter className="mt-auto gap-2 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("brokerBonuses.newDialog.cancel")}
            </Button>
            <Button
              onClick={submit}
              disabled={!settings || save.isPending || !isDirty || hasErrors}
            >
              {t("brokerBonuses.settings.save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
