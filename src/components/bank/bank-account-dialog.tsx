import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateBankAccount, useCompanies, useUpdateBankAccount } from "@/data";
import type { BankAccount } from "@/lib/data/types";
import {
  BANK_ACCOUNT_DIALOG_RULES,
  emptyBankAccountFields,
  normalizeBankAccountFields,
  type BankAccountFields,
} from "@/lib/data/bank-account-fields";
import { useTranslation } from "@/lib/i18n";
import { errorText } from "@/lib/data/format";
import { BankAccountFormFields } from "./bank-account-form-fields";
import { useBankAccountForm } from "./use-bank-account-form";

function newAccountFields(): BankAccountFields {
  return { ...emptyBankAccountFields(), currency: "EUR" };
}

function fieldsFromAccount(a: BankAccount): BankAccountFields {
  return {
    accountName: a.account_name ?? "",
    companyId: a.company_id,
    iban: a.iban,
    bic: a.bic,
    holder: a.holder,
    bankName: a.bank_name,
    productType: a.product_type,
    currency: a.currency,
  };
}

/**
 * Create or edit a bank_accounts row — the manual company-assignment step BANKSapi's own sync
 * never does (ported from immonetz's Bankkonten dialog; see bank-accounts.functions.ts for why
 * this goes through a server function here instead of immonetz's direct client write).
 */
export function BankAccountDialog({
  account,
  variant = "default",
}: {
  account?: BankAccount;
  /**
   * The create button's emphasis. On the merged Bankkonten screen "Bank verbinden" is the primary
   * action (connecting is how accounts actually arrive) and creating one by hand is the fallback,
   * so two solid buttons side by side would have said they matter equally.
   */
  variant?: "default" | "outline";
}) {
  const { t } = useTranslation();
  const companiesQ = useCompanies();
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const isEdit = !!account;

  const [open, setOpen] = useState(false);
  const form = useBankAccountForm(
    () => (account ? fieldsFromAccount(account) : newAccountFields()),
    BANK_ACCOUNT_DIALOG_RULES,
  );
  const { reset } = form;

  // Re-seed the form every time the dialog opens, so stale edits from a previous open (or a
  // sync that updated the account in the background) never leak into the next one.
  useEffect(() => {
    if (open) reset(account ? fieldsFromAccount(account) : newAccountFields());
  }, [open, account, reset]);

  const companies = companiesQ.data ?? [];
  const pending = isEdit ? update.isPending : create.isPending;
  const canSubmit = form.isValid && form.isDirty && !pending;

  function submit() {
    const payload = normalizeBankAccountFields(form.values);

    const onSuccess = () => {
      toast.success(
        isEdit ? t("bankAccounts.dialog.toastUpdated") : t("bankAccounts.dialog.toastCreated"),
      );
      setOpen(false);
    };
    const onError = (e: unknown) =>
      toast.error(t("bankAccounts.dialog.toastFailed", { error: errorText(e) }));

    if (isEdit && account) {
      update.mutate({ ...payload, accountId: account.id }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="size-7 text-muted-foreground hover:text-foreground"
            title={t("bankAccounts.dialog.editTitle")}
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant={variant} className="gap-2">
            <Plus className="size-4" />
            {t("bankAccounts.dialog.createButton")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("bankAccounts.dialog.editTitle") : t("bankAccounts.dialog.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("bankAccounts.dialog.description")}</DialogDescription>
        </DialogHeader>

        <BankAccountFormFields
          form={form}
          companies={companies}
          rules={BANK_ACCOUNT_DIALOG_RULES}
        />

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} type="button">
            {t("bankAccounts.dialog.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {pending ? t("bankAccounts.dialog.saving") : t("bankAccounts.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
