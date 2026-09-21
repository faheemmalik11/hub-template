import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Card } from "@/components/ui/card";
import { BRAND, brandVars } from "@/config/brand";
import { useTranslation } from "@/lib/i18n";
import { team } from "@/seed";

export const Route = createFileRoute("/demo")({
  head: () => ({ meta: [{ title: `${BRAND.productName} · Demo` }] }),
  component: DemoRegister,
});

/**
 * A click-through demo: pick a profile instead of signing in.
 *
 * Deliberately separate from the real login (`auth-gate.tsx`, Supabase email and password). No
 * session is created and nothing is written; this exists only to show the interface without
 * credentials.
 *
 * The people come from `src/seed`, never from a client's own team. Names typed in here would be
 * one client's staff appearing in the next client's Hub.
 */
type DemoProfile = {
  id: string;
  name: string;
  role: "management" | "accounting";
};

const DEMO_PROFILES: DemoProfile[] = team.map((one) => ({
  id: one.id,
  name: one.name,
  role: one.role === "assistant" ? "accounting" : "management",
}));

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function DemoRegister() {
  const { t } = useTranslation();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* The brand panel */}
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
            {t("demo.panelTitleLine1", brandVars())}
            <br />
            {t("demo.panelTitleLine2")}
          </p>
        </div>
        <div className="relative text-xs uppercase tracking-brand text-white/60">
          {t("demo.panelFooter", brandVars())}
        </div>
      </div>

      {/* Pick a profile */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="h-7" />
          </div>

          <span className="inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand-dark">
            <ShieldCheck className="size-3.5" />
            {t("demo.badge")}
          </span>

          <h1 className="mt-6 font-display text-3xl text-foreground">{t("demo.heading")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("demo.subheading")}</p>

          <ul className="mt-8 space-y-3">
            {DEMO_PROFILES.map((profile) => (
              <li key={profile.id}>
                <Card className="flex items-center gap-3 p-4 transition-colors hover:border-brand">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-medium text-brand-dark"
                  >
                    {initials(profile.name)}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {profile.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {profile.role === "management"
                        ? t("demo.roleManagement")
                        : t("demo.roleAccounting")}
                    </span>
                  </span>
                </Card>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-muted-foreground">{t("demo.note")}</p>
        </div>
      </div>
    </div>
  );
}
