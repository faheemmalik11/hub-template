import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { UIScaleProvider } from "@/lib/ui-scale";
import { I18nProvider, useTranslation } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "@/components/layout/auth-gate";
import { BRAND, pageTitle } from "@/config/brand";

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("errorPage.notFoundTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("errorPage.notFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("errorPage.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useTranslation();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("errorPage.errorTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errorPage.errorBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("errorPage.tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("errorPage.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: pageTitle() },
      { name: "description", content: BRAND.description },
      // No indexing, no crawling. Internal tool.
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { name: "googlebot", content: "noindex, nofollow" },
      { name: "theme-color", content: BRAND.themeColor },
      // Link previews (Slack/Teams). No og:image, see BRAND.assets.
      { property: "og:title", content: BRAND.productName },
      { property: "og:description", content: BRAND.description },
      { property: "og:type", content: "website" },
    ],
    links: [
      // Only the .ico exists. The former svg/png/apple-touch entries pointed at
      // files that were never in `public/` and 404'd on every page load.
      { rel: "icon", href: BRAND.assets.icon, sizes: "any" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap",
      },
    ],
    // Feedback widget (BugHerd): only renders when the key is configured for the environment, and
    // only BugHerd project members/guests ever see the sidebar — regular users get nothing.
    scripts: import.meta.env.VITE_BUGHERD_KEY
      ? [
          {
            src: `https://www.bugherd.com/sidebarv2.js?apikey=${import.meta.env.VITE_BUGHERD_KEY}`,
            async: true,
          },
        ]
      : [],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <UIScaleProvider>
          <AuthProvider>
            <AuthGate>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
            </AuthGate>
          </AuthProvider>
        </UIScaleProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
