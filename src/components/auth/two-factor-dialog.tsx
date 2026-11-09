import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeInput } from "@/components/auth/code-input";
import { CopyButton } from "@/kit/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/config/brand";
import { verifyWithAnyFactor } from "@/lib/mfa";
import i18n, { useTranslation } from "@/lib/i18n";
import { errorText, formatDate } from "@/lib/data/format";

type Enrolling = { factorId: string; qrCode: string; secret: string };

function describeEnrollingDevice(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

function verifyErrorMessageFromSupabaseCode(
  error: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const code = String((error as { code?: string })?.code ?? "").toLowerCase();
  switch (code) {
    case "mfa_verification_failed":
      return t("auth.mfa.errorWrongCode");
    case "mfa_challenge_expired":
      return t("auth.mfa.errorExpired");
    case "over_request_rate_limit":
      return t("auth.mfa.errorTooManyAttempts");
    case "too_many_enrolled_mfa_factors":
      return t("auth.mfa.errorTooManyDevices");
    case "mfa_totp_enroll_disabled":
    case "mfa_totp_verify_disabled":
      return t("auth.mfa.errorNotEnabled");
    case "mfa_ip_address_mismatch":
      return t("auth.mfa.errorNetworkChanged");
    default:
      return t("auth.mfa.toastVerifyFailed", { error: errorText(error) });
  }
}

function NumberedStep({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-medium text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function TwoFactorPanel({
  active = true,
  autoStart = false,
  onEnrolled,
  onFactorsChanged,
}: {
  active?: boolean;
  autoStart?: boolean;
  onEnrolled?: () => void;
  onFactorsChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [factors, setFactors] = useState<{ id: string; added: string }[]>([]);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [reauthFactorId, setReauthFactorId] = useState<string | null>(null);
  const [factorAwaitingRemoval, setFactorAwaitingRemoval] = useState<string | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "start" | "confirm" | string>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoaded(true);
    if (error) {
      toast.error(i18n.t("auth.mfa.toastLoadFailed", { error: errorText(error) }));
      return;
    }
    setFactors(
      (data?.totp ?? [])
        .filter((f) => f.status === "verified")
        .map((f) => ({ id: f.id, added: f.created_at ?? "" })),
    );
  }, []);

  useEffect(() => {
    if (!active) return;
    setEnrolling(null);
    setCode("");
    setLoaded(false);
    void load();
  }, [active, load]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !loaded || busy) return;
    if (factors.length > 0 || enrolling) return;
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, loaded, busy, factors.length, enrolling]);

  async function start() {
    setBusy("start");
    if (factors.length > 0) {
      const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!level.error && level.data?.currentLevel !== "aal2") {
        setBusy(null);
        setCode("");
        setReauthFactorId(factors[0].id);
        return;
      }
    }
    const { data: existing } = await supabase.auth.mfa.listFactors();
    const all = existing?.all ?? [];
    for (const factor of all) {
      if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const taken = new Set(
      all.filter((f) => f.status === "verified").map((f) => f.friendly_name ?? ""),
    );
    const base = describeEnrollingDevice();
    let name = base;
    for (let i = 2; taken.has(name); i += 1) name = `${base} (${i})`;

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: name,
      issuer: BRAND.name,
    });
    setBusy(null);
    if (error || !data) {
      console.error("[2fa] enroll failed:", error);
      setStartFailed(true);
      if (/aal2/i.test(errorText(error)) && factors.length > 0) {
        setCode("");
        setReauthFactorId(factors[0].id);
        return;
      }
      toast.error(t("auth.mfa.toastStartFailed", { error: errorText(error) }));
      return;
    }
    setStartFailed(false);
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function reauth(entered?: string) {
    const value = entered ?? code;
    if (!reauthFactorId) return;
    setBusy("confirm");
    const result = await verifyWithAnyFactor(value);
    setBusy(null);
    if (!result.ok) {
      console.error("[2fa] reauth verify failed:", result.error);
      setCode("");
      toast.error(verifyErrorMessageFromSupabaseCode(result.error, t));
      return;
    }
    setReauthFactorId(null);
    setCode("");
    if (factorAwaitingRemoval) {
      const factorId = factorAwaitingRemoval;
      setFactorAwaitingRemoval(null);
      void remove(factorId);
      return;
    }
    void start();
  }

  async function confirm() {
    if (!enrolling) return;
    setBusy("confirm");
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
    if (challenge.error || !challenge.data) {
      setBusy(null);
      toast.error(t("auth.mfa.toastVerifyFailed", { error: errorText(challenge.error) }));
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setBusy(null);
    if (error) {
      console.error("[2fa] enrol verify failed:", error);
      setCode("");
      toast.error(verifyErrorMessageFromSupabaseCode(error, t));
      return;
    }
    toast.success(t("auth.mfa.toastEnabled"));
    setEnrolling(null);
    setCode("");
    void load();
    onEnrolled?.();
  }

  async function remove(factorId: string) {
    setBusy(factorId);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(null);
    if (error) {
      if (/aal2/i.test(errorText(error))) {
        setFactorAwaitingRemoval(factorId);
        setReauthFactorId(factorId);
        setCode("");
        return;
      }
      toast.error(t("auth.mfa.toastRemoveFailed", { error: errorText(error) }));
      return;
    }
    toast.success(t("auth.mfa.toastRemoved"));
    await supabase.auth.refreshSession();
    void load();
    onFactorsChanged?.();
  }

  return (
    <div className="min-w-0 space-y-4">
      {!loaded || (autoStart && !enrolling && !reauthFactorId && !startFailed) ? (
        <div className="space-y-3">
          <Skeleton className="mx-auto size-40 rounded-lg sm:size-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : reauthFactorId ? (
        <NumberedStep n={1} title={t("auth.mfa.reauthTitle")} hint={t("auth.mfa.reauthHint")}>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={(entered) => void reauth(entered)}
            disabled={!!busy}
            autoFocus
          />
          <p className="mt-2 text-xs text-muted-foreground">{t("auth.mfa.multipleEntriesHint")}</p>
        </NumberedStep>
      ) : enrolling ? (
        <div className="space-y-4">
          <NumberedStep n={1} title={t("auth.mfa.step1")} hint={t("auth.mfa.step1Hint")}>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <img
                src={enrolling.qrCode}
                alt={t("auth.mfa.qrAlt")}
                className="mx-auto size-48 rounded-lg bg-white p-3 shadow-sm"
              />
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">{t("auth.mfa.secretHint")}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] tracking-wider text-foreground">
                    {enrolling.secret}
                  </code>
                  <CopyButton
                    value={enrolling.secret}
                    labels={{
                      action: t("auth.mfa.secret"),
                      copied: t("auth.mfa.secretCopied"),
                      failed: t("auth.mfa.secretCopyFailed"),
                    }}
                  />
                </div>
              </div>
            </div>
          </NumberedStep>

          <NumberedStep n={2} title={t("auth.mfa.step2")} hint={t("auth.mfa.step2Hint")}>
            <CodeInput value={code} onChange={setCode} disabled={!!busy} autoFocus />
          </NumberedStep>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-start gap-3 bg-muted/40 p-3">
              {factors.length > 0 ? (
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              ) : (
                <ShieldOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {factors.length > 0 ? t("auth.mfa.statusActive") : t("auth.mfa.statusOff")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {factors.length > 0 ? t("auth.mfa.activeHint") : t("auth.mfa.notActiveHint")}
                </p>
              </div>
            </div>

            {factors.map((factor) => (
              <div
                key={factor.id}
                className="flex items-center justify-between gap-3 border-t border-border px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">
                    {t("auth.mfa.authenticatorApp")}
                  </span>
                  {factor.added ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("auth.mfa.addedOn", { date: formatDate(factor.added) })}
                    </span>
                  ) : null}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(factor.id)}
                  disabled={!!busy}
                  className="gap-2"
                >
                  {busy === factor.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {busy === factor.id ? t("auth.mfa.removing") : t("auth.mfa.remove")}
                </Button>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {factors.length === 0 ? t("auth.mfa.appHint") : t("auth.mfa.lastDeviceHint")}
          </p>
        </div>
      )}

      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-2",
          autoStart && !enrolling && !reauthFactorId && !startFailed && "hidden",
        )}
      >
        {reauthFactorId ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setReauthFactorId(null);
                setFactorAwaitingRemoval(null);
                setCode("");
              }}
              disabled={!!busy}
            >
              {t("auth.mfa.cancel")}
            </Button>
            <Button
              onClick={() => void reauth()}
              disabled={!!busy || code.length !== 6}
              className="gap-2"
            >
              {busy === "confirm" ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy === "confirm" ? t("auth.mfa.checking") : t("auth.mfa.continue")}
            </Button>
          </>
        ) : enrolling ? (
          <>
            {!autoStart && (
              <Button variant="ghost" onClick={() => setEnrolling(null)} disabled={!!busy}>
                {t("auth.mfa.cancel")}
              </Button>
            )}
            <Button onClick={confirm} disabled={!!busy || code.length !== 6} className="gap-2">
              {busy === "confirm" ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy === "confirm" ? t("auth.mfa.checking") : t("auth.mfa.confirm")}
            </Button>
          </>
        ) : (
          factors.length === 0 && (
            <Button onClick={start} disabled={!!busy || !loaded} className="gap-2">
              {busy === "start" ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy === "start" ? t("auth.mfa.settingUp") : t("auth.mfa.setUp")}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export function TwoFactorDialog({
  open,
  onOpenChange,
  onFactorsChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFactorsChanged?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("auth.mfa.title")}</DialogTitle>
          <DialogDescription>{t("auth.mfa.description")}</DialogDescription>
        </DialogHeader>
        <TwoFactorPanel active={open} onFactorsChanged={onFactorsChanged} />
      </DialogContent>
    </Dialog>
  );
}
