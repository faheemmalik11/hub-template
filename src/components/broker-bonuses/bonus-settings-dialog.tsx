import { useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { parseDecimal } from "@/components/commission/deal-form";
import { useBonusSettings, useSaveBonusSettings } from "@/data";
import type { BonusSettings } from "@/data";
import { errorText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

type NumberKey = Exclude<keyof BonusSettings, "company_lead_deducts_costs">;

const NUMBER_FIELDS: NumberKey[] = [
  "notary_amount",
  "follow_up_amount",
  "own_lead_share_percent",
  "company_lead_share_percent",
  "personnel_flat_amount",
];

export function BonusSettingsDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const settingsQ = useBonusSettings(open);
  const save = useSaveBonusSettings();
  const [typed, setTyped] = useState<Partial<Record<NumberKey, string>>>({});
  const [deductsCosts, setDeductsCosts] = useState<boolean | null>(null);
  const settings = settingsQ.data;

  const valueOf = (key: NumberKey) => typed[key] ?? String(settings?.[key] ?? "").replace(".", ",");
  const submit = () => {
    if (!settings) return;
    const next = {
      ...settings,
      company_lead_deducts_costs: deductsCosts ?? settings.company_lead_deducts_costs,
    };
    for (const key of NUMBER_FIELDS) {
      const value = parseDecimal(valueOf(key));
      if (value === null || value < 0) return toast.error(t("brokerBonuses.settings.invalid"));
      next[key] = value;
    }
    save.mutate(next, {
      onSuccess: () => {
        toast.success(t("brokerBonuses.settings.saved"));
        setOpen(false);
        setTyped({});
        setDeductsCosts(null);
      },
      onError: (error) => toast.error(t("brokerBonuses.failed"), { description: errorText(error) }),
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Settings2 /> {t("brokerBonuses.settings.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("brokerBonuses.settings.title")}</DialogTitle>
            <DialogDescription>{t("brokerBonuses.settings.desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {NUMBER_FIELDS.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label>{t(`brokerBonuses.settings.${key}`)}</Label>
                <Input
                  inputMode="decimal"
                  value={valueOf(key)}
                  onChange={(event) => setTyped({ ...typed, [key]: event.target.value })}
                  disabled={!settings}
                />
              </div>
            ))}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("brokerBonuses.newDialog.cancel")}
            </Button>
            <Button onClick={submit} disabled={!settings || save.isPending}>
              {t("brokerBonuses.settings.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
