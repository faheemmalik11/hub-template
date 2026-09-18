/**
 * Shared "you may not see this page" panel for role-gated routes.
 *
 * Every gated route used to `<Navigate to="/" />` when the role didn't match, which silently
 * dropped the user back on the dashboard, indistinguishable from a click that simply didn't
 * register, and impossible to tell apart from a broken route. Papierkorb already replaced that
 * with a visible explanation (see its own comment); this is that same panel, extracted so the
 * remaining gated routes can share it instead of each re-deciding what a denied role looks like.
 *
 * `variant` picks the wording only. The actual gating stays in each route, and RLS remains the
 * real boundary either way:
 *   'admin'   admins only (Team, Freigabe-Regeln, Dateibenennung)
 *   'manager' supervisors and admins, i.e. everyone except assistants (Kostenanalyse,
 *             Protokoll, Bankverbindungen)
 */
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export function KeinZugriff({ variant = "admin" }: { variant?: "admin" | "manager" }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-card px-6 py-12 text-center">
      <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
        {t("zugriff.titel")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(variant === "admin" ? "zugriff.textAdmin" : "zugriff.textManager")}
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">{t("zugriff.zurueck")}</Link>
      </Button>
    </div>
  );
}
