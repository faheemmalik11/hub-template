// Settings for the bank screens, on their own page.
//
// The allowed payment difference lived behind a "Zuordnungsregeln" button on the transaction list.
// Two things were wrong with that: a setting that governs what the nightly sync accepts is not a
// list-screen control, and the button was hidden outright for anyone who could not change it, so
// most of the team could not even see that the rule existed or what it was set to.
//
// Here it is a page: everyone may read the value, and only an admin may change it. That difference
// matters because the number explains behaviour people see every day -- why a payment 30 cents
// short was suggested, and why one 3 euros short was not.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/belege/query-states";
import { useAuth } from "@/lib/auth";
import { fehlerText } from "@/lib/data/format";
import { useMatchingSettings, useUpdateMatchingSettings } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/bank-einstellungen/")({
  head: () => ({ meta: [{ title: pageTitle("Bank-Einstellungen") }] }),
  component: BankEinstellungenPage,
});

function BankEinstellungenPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  // Mirrors the RLS policy on matching_settings (migration 20260910170000). Reading is open to
  // everyone; writing is not.
  const darfAendern = role === "admin" || role === "super_admin";

  const settingsQ = useMatchingSettings();
  const updateSettings = useUpdateMatchingSettings();
  const [tolerance, setTolerance] = useState("");

  // Seeded from the server once it arrives, and again whenever it changes underneath -- two admins
  // on the same screen should not silently overwrite each other with a stale field value.
  useEffect(() => {
    if (settingsQ.data) setTolerance(String(settingsQ.data.amount_tolerance ?? 0.01));
  }, [settingsQ.data]);

  const eingegeben = parseFloat(tolerance);
  const ungueltig = Number.isNaN(eingegeben) || eingegeben < 0 || eingegeben > 10;
  const geaendert =
    settingsQ.data != null && !ungueltig && eingegeben !== Number(settingsQ.data.amount_tolerance);

  async function speichern() {
    if (ungueltig) {
      toast.error(t("bank.matchingSettings.invalidTolerance"));
      return;
    }
    try {
      await updateSettings.mutateAsync({ amount_tolerance: eingegeben });
      toast.success(t("bank.matchingSettings.toastSuccess"));
    } catch (error) {
      toast.error(t("bank.matchingSettings.toastError", { error: fehlerText(error) }));
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("bankSettings.title")}
      </h1>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {t("bank.matchingSettings.title")}
        </h2>
        {settingsQ.isLoading ? (
          <Skeleton className="mt-4 h-10 w-56" />
        ) : settingsQ.isError ? (
          <div className="mt-4">
            <ErrorState error={settingsQ.error} onRetry={() => settingsQ.refetch()} />
          </div>
        ) : (
          <div className="mt-4 w-56 space-y-1.5">
            {/* One width for the label and the field, so the input ends where the label ends.
                `w-fit` looked like the elegant way to do that and is not: fit-content takes the
                WIDEST child's max-content, and an <input> carries an intrinsic ~425px of its own,
                so the group sized to the field and the label floated inside it. A shared explicit
                width is honest and holds in both languages. */}
            <Label htmlFor="tolerance" className="text-sm font-medium">
              {t("bank.matchingSettings.amountTolerance")}
            </Label>
            <Input
              id="tolerance"
              type="number"
              step="0.01"
              min="0"
              max="10"
              className="w-full"
              value={tolerance}
              // Read-only rather than absent for a non-admin: the number explains what they see
              // on the reconciliation screens all day, and hiding it makes the behaviour
              // arbitrary rather than governed.
              disabled={!darfAendern}
              onChange={(e) => setTolerance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("bank.matchingSettings.amountToleranceHint")}
            </p>
            {!darfAendern && (
              <p className="pt-1 text-xs text-muted-foreground">{t("bankSettings.nurAdmin")}</p>
            )}
          </div>
        )}

        {darfAendern && (
          <div className="mt-5 flex items-center gap-2">
            <Button
              onClick={speichern}
              disabled={!geaendert || updateSettings.isPending || settingsQ.isLoading}
              className="gap-2"
            >
              {updateSettings.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("bank.matchingSettings.save")}
            </Button>
            {geaendert && (
              <span className="text-xs text-muted-foreground">
                {t("bankSettings.ungespeichert")}
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
