import { useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FeeKind } from "@/data";
import type { CommissionSide } from "@/kit/lib/commission";
import { errorText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import type { PartyForm, SideForm } from "./deal-form";

const EMPTY_PARTY: PartyForm = { customerId: "", share: "", discount: "", discountReason: "" };

export function SideCard({
  side,
  value,
  onChange,
  customerOptions,
  createCustomer,
  disabled,
}: {
  side: CommissionSide;
  value: SideForm;
  onChange: (next: SideForm) => void;
  customerOptions: ComboboxOption[];
  createCustomer: (name: string) => Promise<string>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creating, setCreating] = useState(false);
  const set = (patch: Partial<SideForm>) => onChange({ ...value, ...patch });
  const setParty = (index: number, patch: Partial<SideForm["parties"][number]>) =>
    set({
      parties: value.parties.map((party, i) => (i === index ? { ...party, ...patch } : party)),
    });

  const addNewCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const customerId = await createCustomer(name);
      set({ parties: [...value.parties, { ...EMPTY_PARTY, customerId }] });
      setNewCustomerName("");
    } catch (error) {
      toast.error(t("commissionDeals.side.customerFailed"), { description: errorText(error) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {t(`commissionDeals.side.${side}`)}
        </h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("commissionDeals.side.pays")}
          <Switch
            checked={value.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
            disabled={disabled}
          />
        </label>
      </div>

      {value.enabled && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("commissionDeals.side.feeKind")}</Label>
              <Select
                value={value.feeKind}
                onValueChange={(feeKind) => set({ feeKind: feeKind as FeeKind })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t("commissionDeals.side.percent")}</SelectItem>
                  <SelectItem value="fixed">{t("commissionDeals.side.fixed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.feeKind === "percent" ? (
              <div className="space-y-1.5">
                <Label>{t("commissionDeals.side.rate")}</Label>
                <Input
                  inputMode="decimal"
                  value={value.rate}
                  onChange={(event) => set({ rate: event.target.value })}
                  placeholder="2,5"
                  disabled={disabled}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("commissionDeals.side.amount")}</Label>
                <Input
                  inputMode="decimal"
                  value={value.amount}
                  onChange={(event) => set({ amount: event.target.value })}
                  disabled={disabled}
                />
              </div>
            )}
          </div>

          <div>
            <Label>{t("commissionDeals.side.payers")}</Label>
            <p className="text-xs text-muted-foreground">{t("commissionDeals.side.shareHint")}</p>
            <div className="mt-2 space-y-2">
              {value.parties.map((party, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border/60 p-2">
                  <div className="flex items-center gap-2">
                    <Combobox
                      className="flex-1"
                      value={party.customerId || null}
                      onValueChange={(customerId) => setParty(index, { customerId })}
                      options={customerOptions}
                      placeholder={t("commissionDeals.side.payerPlaceholder")}
                      searchPlaceholder={t("commissionDeals.side.payerSearch")}
                      emptyText={t("commissionDeals.side.noCustomers")}
                      disabled={disabled}
                    />
                    <Input
                      className="w-24"
                      inputMode="decimal"
                      value={party.share}
                      onChange={(event) => setParty(index, { share: event.target.value })}
                      placeholder={t("commissionDeals.side.share")}
                      aria-label={t("commissionDeals.side.share")}
                      disabled={disabled}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => set({ parties: value.parties.filter((_, i) => i !== index) })}
                      aria-label={t("commissionDeals.side.remove")}
                      disabled={disabled}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="w-40"
                      inputMode="decimal"
                      value={party.discount}
                      onChange={(event) => setParty(index, { discount: event.target.value })}
                      placeholder={t("commissionDeals.side.discount")}
                      aria-label={t("commissionDeals.side.discount")}
                      disabled={disabled}
                    />
                    <Input
                      className="flex-1"
                      value={party.discountReason}
                      onChange={(event) => setParty(index, { discountReason: event.target.value })}
                      placeholder={t("commissionDeals.side.discountReason")}
                      aria-label={t("commissionDeals.side.discountReason")}
                      disabled={disabled || !party.discount.trim()}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => set({ parties: [...value.parties, EMPTY_PARTY] })}
                disabled={disabled}
              >
                <Plus className="size-4" /> {t("commissionDeals.side.addPayer")}
              </Button>
              <div className="flex flex-1 gap-2">
                <Input
                  className="h-9 min-w-40 flex-1"
                  value={newCustomerName}
                  onChange={(event) => setNewCustomerName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addNewCustomer()}
                  placeholder={t("commissionDeals.side.newCustomerPlaceholder")}
                  disabled={disabled}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addNewCustomer}
                  disabled={disabled || creating || !newCustomerName.trim()}
                >
                  <UserPlus className="size-4" /> {t("commissionDeals.side.createCustomer")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
