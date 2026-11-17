import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/feld";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FeeKind } from "@/data";
import type { CommissionSide } from "@/kit/lib/commission";
import { errorText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import type { PartyForm, SideForm } from "./deal-form";

const EMPTY_PARTY: PartyForm = { customerId: "", share: "", discount: "", discountReason: "" };

function sanitizeAmountInput(raw: string): string {
  const digitsAndSeparators = raw.replace(/[^0-9.,]/g, "");
  const separatorIndex = digitsAndSeparators.search(/[.,]/);
  if (separatorIndex === -1) return digitsAndSeparators;
  return (
    digitsAndSeparators.slice(0, separatorIndex + 1) +
    digitsAndSeparators.slice(separatorIndex + 1).replace(/[.,]/g, "")
  );
}

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
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const set = (patch: Partial<SideForm>) => onChange({ ...value, ...patch });
  const setParty = (index: number, patch: Partial<SideForm["parties"][number]>) =>
    set({
      parties: value.parties.map((party, i) => (i === index ? { ...party, ...patch } : party)),
    });
  const availableCustomerOptions = (index: number) => {
    const chosenByOthers = new Set(
      value.parties.flatMap((party, i) =>
        i === index ? [] : party.customerId ? [party.customerId] : [],
      ),
    );
    return customerOptions.filter((option) => !chosenByOthers.has(option.value));
  };
  const lastPartyHasNoCustomer =
    value.parties.length > 0 && !value.parties[value.parties.length - 1].customerId;
  const removeParty = (index: number) =>
    set({ parties: value.parties.filter((_, i) => i !== index) });

  const createPayerCustomer = async (index: number, name: string) => {
    setCreatingIndex(index);
    try {
      const customerId = await createCustomer(name);
      setParty(index, { customerId });
    } catch (error) {
      toast.error(t("commissionDeals.side.customerFailed"), { description: errorText(error) });
    } finally {
      setCreatingIndex(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-end gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t(`commissionDeals.side.${side}`)} {t("commissionDeals.side.pays")}
          <Switch
            checked={value.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
            disabled={disabled}
          />
        </label>
      </div>

      {value.enabled && (
        <div className="mt-4 space-y-4">
          <div id={`side-${side}-fee`} className="grid gap-3 sm:grid-cols-2">
            <Field className="space-y-1.5">
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
              <p className="text-xs text-muted-foreground">
                {t("commissionDeals.side.feeKindHint")}
              </p>
            </Field>
            {value.feeKind === "percent" ? (
              <Field className="space-y-1.5">
                <Label>{t("commissionDeals.side.rate")}</Label>
                <Input
                  inputMode="decimal"
                  value={value.rate}
                  onChange={(event) => set({ rate: sanitizeAmountInput(event.target.value) })}
                  placeholder={t("commissionDeals.side.ratePlaceholder")}
                  disabled={disabled}
                />
              </Field>
            ) : (
              <Field className="space-y-1.5">
                <Label>{t("commissionDeals.side.amount")}</Label>
                <Input
                  inputMode="decimal"
                  value={value.amount}
                  onChange={(event) => set({ amount: sanitizeAmountInput(event.target.value) })}
                  disabled={disabled}
                />
              </Field>
            )}
          </div>

          <div id={`side-${side}-payers`} className="@container">
            <Label>{t("commissionDeals.side.payers")}</Label>
            <p className="text-xs text-muted-foreground">{t("commissionDeals.side.payersHint")}</p>
            <p className="text-xs text-muted-foreground">{t("commissionDeals.side.shareHint")}</p>
            <p className="text-xs text-muted-foreground">
              {t("commissionDeals.side.discountHint")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("commissionDeals.side.discountReasonHint")}
            </p>

            <div className="mt-2 hidden @lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>{t("commissionDeals.side.customer")}</TableHead>
                    <TableHead className="w-24">{t("commissionDeals.side.share")}</TableHead>
                    <TableHead className="w-28">{t("commissionDeals.side.discount")}</TableHead>
                    <TableHead>{t("commissionDeals.side.discountReason")}</TableHead>
                    <TableHead className="w-9" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {value.parties.map((party, index) => (
                    <TableRow key={index}>
                      <TableCell className="align-top">
                        <Combobox
                          value={party.customerId || null}
                          onValueChange={(customerId) => setParty(index, { customerId })}
                          options={availableCustomerOptions(index)}
                          placeholder={t("commissionDeals.side.payerPlaceholder")}
                          searchPlaceholder={t("commissionDeals.side.payerSearch")}
                          emptyText={t("commissionDeals.side.noCustomers")}
                          onCreateNew={(name) => createPayerCustomer(index, name)}
                          disabled={disabled || creatingIndex === index}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          inputMode="decimal"
                          value={party.share}
                          onChange={(event) =>
                            setParty(index, { share: sanitizeAmountInput(event.target.value) })
                          }
                          placeholder={t("commissionDeals.side.share")}
                          aria-label={t("commissionDeals.side.share")}
                          disabled={disabled}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          inputMode="decimal"
                          value={party.discount}
                          onChange={(event) =>
                            setParty(index, { discount: sanitizeAmountInput(event.target.value) })
                          }
                          placeholder={t("commissionDeals.side.discount")}
                          aria-label={t("commissionDeals.side.discount")}
                          disabled={disabled}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          value={party.discountReason}
                          onChange={(event) =>
                            setParty(index, { discountReason: event.target.value })
                          }
                          placeholder={t("commissionDeals.side.discountReason")}
                          aria-label={t("commissionDeals.side.discountReason")}
                          disabled={disabled || !party.discount.trim()}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeParty(index)}
                          aria-label={t("commissionDeals.side.remove")}
                          disabled={disabled}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-2 space-y-2 @lg:hidden">
              {value.parties.map((party, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border/60 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">
                      {t("commissionDeals.side.customer")}
                    </Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeParty(index)}
                      aria-label={t("commissionDeals.side.remove")}
                      disabled={disabled}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Combobox
                    value={party.customerId || null}
                    onValueChange={(customerId) => setParty(index, { customerId })}
                    options={availableCustomerOptions(index)}
                    placeholder={t("commissionDeals.side.payerPlaceholder")}
                    searchPlaceholder={t("commissionDeals.side.payerSearch")}
                    emptyText={t("commissionDeals.side.noCustomers")}
                    onCreateNew={(name) => createPayerCustomer(index, name)}
                    disabled={disabled || creatingIndex === index}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("commissionDeals.side.share")}
                      </Label>
                      <Input
                        inputMode="decimal"
                        value={party.share}
                        onChange={(event) =>
                          setParty(index, { share: sanitizeAmountInput(event.target.value) })
                        }
                        placeholder={t("commissionDeals.side.share")}
                        aria-label={t("commissionDeals.side.share")}
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("commissionDeals.side.discount")}
                      </Label>
                      <Input
                        inputMode="decimal"
                        value={party.discount}
                        onChange={(event) =>
                          setParty(index, { discount: sanitizeAmountInput(event.target.value) })
                        }
                        placeholder={t("commissionDeals.side.discount")}
                        aria-label={t("commissionDeals.side.discount")}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("commissionDeals.side.discountReason")}
                    </Label>
                    <Input
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

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button
                className="shadow-none"
                variant="outline"
                size="sm"
                onClick={() => set({ parties: [...value.parties, EMPTY_PARTY] })}
                disabled={disabled || lastPartyHasNoCustomer}
              >
                <Plus className="size-4" /> {t("commissionDeals.side.addPayer")}
              </Button>
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <Link to="/customers" target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> {t("commissionDeals.side.fullCustomerLink")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
