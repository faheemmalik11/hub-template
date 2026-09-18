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
import { useCreateBankAccount, useGesellschaften, useUpdateBankAccount } from "@/lib/data/queries";
import type { BankAccount } from "@/lib/data/types";
import {
  BANK_ACCOUNT_DIALOG_RULES,
  emptyBankAccountFields,
  normalizeBankAccountFields,
  type BankAccountFields,
} from "@/lib/data/bank-account-fields";
import { useTranslation } from "@/lib/i18n";
import { fehlerText } from "@/lib/data/format";
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
  const companiesQ = useGesellschaften();
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
        isEdit ? t("bankkonten.dialog.toastUpdated") : t("bankkonten.dialog.toastCreated"),
      );
      setOpen(false);
    };
    const onError = (e: unknown) =>
      toast.error(t("bankkonten.dialog.toastFailed", { error: fehlerText(e) }));

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
            title={t("bankkonten.dialog.editTitle")}
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant={variant} className="gap-2">
            <Plus className="size-4" />
            {t("bankkonten.dialog.createButton")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("bankkonten.dialog.editTitle") : t("bankkonten.dialog.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("bankkonten.dialog.description")}</DialogDescription>
        </DialogHeader>

        <BankAccountFormFields
          form={form}
          companies={companies}
          rules={BANK_ACCOUNT_DIALOG_RULES}
        />

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} type="button">
            {t("bankkonten.dialog.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {pending ? t("bankkonten.dialog.saving") : t("bankkonten.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
