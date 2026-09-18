import { useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, type AuthResult } from "@/lib/auth";
import { brandVars } from "@/lib/brand";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Hält die App hinter dem Login. Vor Anmeldung erscheint nur der Login-Screen,
 * danach die Oberfläche (AppShell + Inhalt).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, user, mustChangePassword } = useAuth();

  // Resolving the session, which needs a round trip for the profile and the company grants. This
  // used to be an empty full-screen div: on a slow connection the app was a blank page for a
  // second or two with nothing to say it was working, and any screen-level skeleton below never
  // got the chance to render because this branch returns before it
  // (docs/audit/papierkorb/trash/ISSUES.md #8).
  if (!ready) {
    // The chrome needs no session to draw, so it is drawn for real: the brand mark, a sidebar of
    // the same width, a header of the same height and the same main padding as AppShell. Only the
    // regions that genuinely wait on data stay blank, and they sit still rather than pulsing --
    // a whole screen of shimmering blocks reads as "something is wrong" and then replaces itself,
    // where a quiet frame reads as "this is the app, loading" and never moves again.
    return (
      <div className="flex min-h-screen bg-background" aria-busy="true" aria-live="polite">
        <div className="hidden w-64 shrink-0 flex-col gap-4 border-r border-border/80 p-3 md:flex">
          <div className="flex h-14 items-center px-1">
            <Logo className="h-7" />
          </div>
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-8 w-full rounded-md bg-muted/50" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/80 px-4">
            <div className="size-5 rounded bg-muted/50" />
            <div className="h-4 w-40 rounded-md bg-muted/50" />
          </div>
          <div className="w-full min-w-0 px-4 py-4 sm:px-6">
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="min-w-0 rounded-2xl bg-brand-wash p-4 lg:col-span-2">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-xl bg-card" />
                  ))}
                </div>
              </div>
              <div className="h-full min-h-56 rounded-2xl bg-brand-wash" />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <div className="h-48 rounded-2xl bg-brand-wash lg:col-span-2" />
              <div className="h-48 rounded-2xl bg-brand-wash" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // A new employee's one-time temp password (Team screen, createEmployee) must not remain
  // usable indefinitely -- this blocks the whole app, not just a dismissible banner, until they
  // set their own. Checked ahead of AppShell so there's no window where the real app is briefly
  // reachable with the temp password still active.
  if (mustChangePassword) {
    return <SetNewPasswordScreen />;
  }

  return <AppShell>{children}</AppShell>;
}

// Translates an AuthResult into the active UI language. `raw` is only reached for provider wording
// we have no key for, which is still more useful than a generic failure line.
function useAuthErrorText() {
  const { t } = useTranslation();
  return (result: AuthResult, fallbackKey: string) => {
    if (result.code && result.code !== "unknown") return t(`auth.error.${result.code}`);
    return result.raw ?? t(fallbackKey);
  };
}

// Password field with a reveal toggle, so a mistyped password can be checked before submitting.
// The toggle is a plain button (never a submit) and stays out of the tab-to-submit path.
function PasswordInput({ className, ...props }: ComponentProps<typeof Input>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function LoginScreen() {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) setError(errorText(result, "auth.login.failed"));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Marken-Panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-dark p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <Logo variant="white" className="h-7" />
        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-tight text-white">
            {t("auth.login.panelTitleLine1")}
            <br />
            {t("auth.login.panelTitleLine2")}
          </p>
          <p className="mt-4 text-sm text-white/75">{t("auth.login.panelSubtitle", brandVars())}</p>
        </div>
        <div className="relative text-xs uppercase tracking-brand text-white/60">
          {t("auth.panelFooter", brandVars())}
        </div>
      </div>

      {/* Login-Form */}
      <div className="relative flex items-center justify-center bg-background px-6 py-12">
        <div className="absolute right-6 top-6">
          <LanguageSwitch />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="h-7" />
          </div>
          <h1 className="font-display text-3xl text-foreground">{t("auth.login.heading")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.login.subheading", brandVars())}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.login.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder={t("auth.login.emailPlaceholder", brandVars())}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.login.password")}</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
              {!submitting && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SetNewPasswordScreen() {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { user, logout, completePasswordChange } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("auth.setPassword.mismatch"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await completePasswordChange(password);
    setSubmitting(false);
    if (!result.ok) setError(errorText(result, "auth.setPassword.failed"));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-dark p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <Logo variant="white" className="h-7" />
        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-tight text-white">
            {t("auth.setPassword.panelTitleLine1")}
            <br />
            {t("auth.setPassword.panelTitleLine2")}
          </p>
          <p className="mt-4 text-sm text-white/75">{t("auth.setPassword.panelSubtitle")}</p>
        </div>
        <div className="relative text-xs uppercase tracking-brand text-white/60">
          {t("auth.panelFooter", brandVars())}
        </div>
      </div>

      <div className="relative flex items-center justify-center bg-background px-6 py-12">
        <div className="absolute right-6 top-6">
          <LanguageSwitch />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="h-7" />
          </div>
          <div className="mb-8 flex items-center gap-2 text-muted-foreground">
            <Lock className="size-4" />
            <span className="text-xs uppercase tracking-brand">{t("auth.setPassword.kicker")}</span>
          </div>
          <h1 className="font-display text-3xl text-foreground">{t("auth.setPassword.heading")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.setPassword.hint", { email: user?.email })}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("auth.setPassword.newPassword")}</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
              />
              <p className="text-xs text-muted-foreground">{t("auth.setPassword.minLengthNote")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("auth.setPassword.confirmPassword")}</Label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(null);
                }}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? t("auth.setPassword.submitting") : t("auth.setPassword.submit")}
              {!submitting && <ArrowRight className="size-4" />}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => void logout()}
            className="mt-6 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("auth.setPassword.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
