import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ManualBankAccountRow } from "@/lib/api/bank-manual-import.functions";
import { useCreateManualBankAccount, useGesellschaften } from "@/lib/data/queries";
import {
  BANK_ACCOUNT_IMPORT_RULES,
  normalizeBankAccountFields,
} from "@/lib/data/bank-account-fields";
import { useTranslation } from "@/lib/i18n";
import { fehlerText } from "@/lib/data/format";
import { BankAccountFormFields } from "./bank-account-form-fields";
import { useBankAccountForm } from "./use-bank-account-form";

export function ManualImportAccountForm({
  onCreated,
  onConflict,
  onCancel,
}: {
  onCreated: (account: ManualBankAccountRow) => void;
  onConflict: (account: ManualBankAccountRow) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const companiesQ = useGesellschaften();
  const create = useCreateManualBankAccount();
  const form = useBankAccountForm(undefined, BANK_ACCOUNT_IMPORT_RULES);

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);
  const canSubmit = form.isValid && form.isDirty && !create.isPending;

  function submit() {
    const values = normalizeBankAccountFields(form.values);
    create.mutate(
      {
        companyId: values.companyId!,
        accountName: values.accountName,
        iban: values.iban!,
        bankName: values.bankName ?? undefined,
        bic: values.bic ?? undefined,
      },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success(t("bank.manualImport.accountForm.toastCreated"));
            onCreated(result.account);
            return;
          }
          if (result.existingAccount) {
            toast.error(t("bank.manualImport.accountForm.ibanConflict"));
            onConflict(result.existingAccount);
            return;
          }
          toast.error(t("bank.manualImport.errors.accountFailed", { error: "iban_conflict" }));
        },
        onError: (e) => {
          toast.error(
            t("bank.manualImport.errors.accountFailed", {
              error: fehlerText(e),
            }),
          );
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <BankAccountFormFields
        form={form}
        companies={companies}
        fields={["iban", "bic", "bankName"]}
        rules={BANK_ACCOUNT_IMPORT_RULES}
        idPrefix="manual-account"
        namePlaceholder={t("bank.manualImport.accountForm.accountNamePlaceholder")}
        companyPlaceholder={t("bank.manualImport.accountForm.companyPlaceholder")}
      />

      <div className="flex items-center justify-between">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} type="button">
            {t("bank.manualImport.account.backToList")}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={submit} disabled={!canSubmit}>
          {create.isPending
            ? t("bank.manualImport.accountForm.submitting")
            : t("bank.manualImport.accountForm.submit")}
        </Button>
      </div>
    </div>
  );
}
