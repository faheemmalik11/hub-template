import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import type { ManualBankAccountRow } from "@/lib/api/bank-manual-import.functions";
import { useBankAccounts } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { ManualImportAccountForm } from "./manual-import-account-form";

/**
 * Step 1 of the manual-import wizard. Accounts BANKSapi cannot reach never get created there, so
 * this can create one too — same fields and rules as the Bankkonten dialog, via
 * BankAccountFormFields.
 */
export function ManualImportAccountStep({
  onSelect,
}: {
  onSelect: (account: ManualBankAccountRow) => void;
}) {
  const { t } = useTranslation();
  const accountsQ = useBankAccounts();
  const [mode, setMode] = useState<"select" | "create">("select");
  const [accountId, setAccountId] = useState("");

  const manualAccounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => a.connect_route === "ebics_or_manual"),
    [accountsQ.data],
  );

  if (mode === "create") {
    return (
      <ManualImportAccountForm
        onCreated={onSelect}
        onConflict={(account) => {
          setAccountId(account.id);
          setMode("select");
        }}
        onCancel={manualAccounts.length > 0 ? () => setMode("select") : undefined}
      />
    );
  }

  const selected = manualAccounts.find((a) => a.id === accountId) ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          {t("bank.manualImport.account.existingLabel")}
        </p>
        {manualAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("bank.manualImport.account.noAccounts")}
          </p>
        ) : (
          <Combobox
            value={accountId}
            onValueChange={setAccountId}
            placeholder={t("bank.manualImport.account.selectPlaceholder")}
            options={manualAccounts.map((a) => ({
              value: a.id,
              label: a.account_name ?? a.iban ?? a.id,
              keywords: a.iban ?? "",
            }))}
          />
        )}
      </div>

      <Button
        variant="link"
        className="h-auto px-0"
        onClick={() => setMode("create")}
        type="button"
      >
        {t("bank.manualImport.account.createNew")}
      </Button>

      <div className="flex justify-end">
        <Button disabled={!selected} onClick={() => selected && onSelect(selected)}>
          {t("bank.manualImport.account.continue")}
        </Button>
      </div>
    </div>
  );
}
