/**
 * Shared "you may not see this page" panel for role-gated routes.
 *
 * Every gated route used to `<Navigate to="/" />` when the role didn't match, which silently
 * dropped the user back on the dashboard, indistinguishable from a click that simply didn't
 * register, and impossible to tell apart from a broken route. Papierkorb already replaced that
 * with a visible explanation (see its own comment); this is that same panel, extracted so the
 * remaining gated routes can share it instead of each re-deciding what a denied role looks like.
 *
 * `variant` picks the wording only, and RLS remains the real boundary either way:
 *   'admin'   admins only (Team, Freigabe-Regeln, Dateibenennung)
 *   'manager' supervisors and admins, i.e. everyone except assistants (Kostenanalyse, Protokoll)
 *   'page'    not live for this account, by role or because the client switched it off
 */
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

const TEXT_KEY = {
  admin: "access.textAdmin",
  manager: "access.textManager",
  page: "access.pageNotAvailable",
} as const;

export function NoAccess({ variant = "admin" }: { variant?: "admin" | "manager" | "page" }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-card px-6 py-12 text-center">
      <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
        {t("access.title")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t(TEXT_KEY[variant])}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">{t("access.back")}</Link>
      </Button>
    </div>
  );
}
