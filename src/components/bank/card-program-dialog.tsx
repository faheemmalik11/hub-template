import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGesellschaften, useUpdateBankAccount } from "@/lib/data/queries";
import type { BankAccount } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";
import { fehlerText } from "@/lib/data/format";
import { cn } from "@/lib/utils";

/**
 * A card programme is not a bank account: no IBAN, no BIC, no bank, no account holder. Only its
 * name and the company it belongs to can be answered, so only those are asked.
 */
export function CardProgramDialog({ account }: { account: BankAccount }) {
  const { t } = useTranslation();
  const companiesQ = useGesellschaften();
  const update = useUpdateBankAccount();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account.account_name ?? "");
  const [companyId, setCompanyId] = useState(account.company_id ?? "");

  useEffect(() => {
    if (open) {
      setName(account.account_name ?? "");
      setCompanyId(account.company_id ?? "");
    }
  }, [open, account]);

  const companies = companiesQ.data ?? [];
  const nameMissing = name.trim().length === 0;
  const changed =
    name.trim() !== (account.account_name ?? "") || companyId !== (account.company_id ?? "");
  const canSubmit = !nameMissing && !!companyId && changed && !update.isPending;

  function submit() {
    update.mutate(
      {
        accountId: account.id,
        accountName: name.trim(),
        companyId: companyId || null,
        iban: account.iban,
        bic: account.bic,
        holder: account.holder,
        bankName: account.bank_name,
        productType: account.product_type,
        currency: account.currency,
      },
      {
        onSuccess: () => {
          toast.success(t("bankkonten.karten.dialog.toastSaved"));
          setOpen(false);
        },
        onError: (e) => toast.error(t("bankkonten.dialog.toastFailed", { error: fehlerText(e) })),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* A named button in the toolbar rather than a pencil beside a heading. The Pleo tab has no
          section header any more, so this is the only route to the programme's company, and an
          unlabelled icon would have been the only unlabelled control in that row.

          It also carries the warning when there is no company. That is not cosmetic: without one,
          `has_company_access(null)` returns true and every Pleo movement is readable by every
          signed-in user. The "Keine Gesellschaft" chip that used to say so lived in the header this
          replaced, so the fact rides on the control that fixes it. */}
      <DialogTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className={cn("gap-2", !account.company_id && "border-warning/40 text-warning")}
          title={t("bankkonten.karten.dialog.titel")}
        >
          <Pencil className="size-4" />
          {account.company_id
            ? t("bankkonten.karten.dialog.button")
            : t("bankkonten.karten.dialog.zuordnen")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("bankkonten.karten.dialog.titel")}</DialogTitle>
          <DialogDescription>{t("bankkonten.karten.dialog.text")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-program-name">{t("bankAccountForm.field.name")}</Label>
            <Input
              id="card-program-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(nameMissing && "border-destructive")}
              aria-invalid={nameMissing || undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("bankAccountForm.field.gesellschaft")}</Label>
            <Combobox
              id="card-program-company"
              value={companyId}
              onValueChange={setCompanyId}
              placeholder={t("bankkonten.karten.dialog.gesellschaftPlaceholder")}
              options={companies.map((c) => ({
                value: c.id,
                label: `${c.code} · ${c.name}`,
                keywords: c.name,
              }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("bankkonten.karten.dialog.gesellschaftHinweis")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} type="button">
            {t("bankkonten.dialog.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {update.isPending ? t("bankkonten.dialog.saving") : t("bankkonten.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
