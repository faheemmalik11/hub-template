// Production-ready i18n foundation (i18next + react-i18next).
//
// - German ("de") is the DEFAULT and the server-render language, so SSR output is
//   deterministic. The client re-syncs to the saved locale after hydration.
// - English ("en") is selectable in the UI in every environment (no localhost gate).
// - The selected locale is persisted in localStorage under `hub.locale`.
// - Reusable for the whole app later; for now only the invoice module consumes the keys.
//
// DB values, DB column/enum values, OCR/PDF content, and persisted audit text are NEVER
// translated. For persisted German audit text use `tDe` (a fixed-German translator).

import { useCallback, useEffect } from "react";
import i18n from "i18next";
import { I18nextProvider, initReactI18next, useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import de from "./locales/de";
import en from "./locales/en";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The flag names the language faster than two letters do. */
export const FLAGS: Record<Locale, string> = { de: "🇩🇪", en: "🇬🇧" };
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_STORAGE_KEY = "hub.locale";

function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en";
}

// Saved locale, client-only. The server always returns the default so the first paint
// matches between server and client (no hydration mismatch); the provider switches after.
export function savedLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

// Initialize once (guarded against HMR / repeated imports).
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
    // Resources are bundled + init is synchronous, so translations are always ready.
    // Disabling Suspense avoids any SSR/first-render edge case throwing a promise.
    react: { useSuspense: false },
  });
}

if (import.meta.hot && i18n.isInitialized) {
  i18n.addResourceBundle("de", "translation", de, true, true);
  i18n.addResourceBundle("en", "translation", en, true, true);
  void i18n.changeLanguage(i18n.language);
}

// Fixed-German translator — ALWAYS returns German regardless of the active UI language.
// Use this for text that gets persisted to the DB (audit/history), so the audit trail
// stays German even when the reviewer is using the English UI.
export const tDe = i18n.getFixedT("de");

export default i18n;

// Provider — wraps the app and syncs the saved locale + <html lang> after hydration.
export function I18nProvider({ children }: { children: ReactNode }) {
  // Apply the persisted locale AFTER hydration (useEffect runs client-only, post-mount),
  // so the initial German paint matches the server, then flips to the saved choice.
  useEffect(() => {
    const target = savedLocale();
    if (i18n.language !== target) void i18n.changeLanguage(target);
    document.documentElement.lang = i18n.language;
  }, []);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

// Read/set the active locale. Persists to localStorage and updates <html lang>.
export function useLocale() {
  const { i18n: instance } = useTranslation();
  const setLocale = useCallback(
    (locale: Locale) => {
      void instance.changeLanguage(locale);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        document.documentElement.lang = locale;
      }
    },
    [instance],
  );
  return { locale: (instance.language as Locale) ?? DEFAULT_LOCALE, setLocale };
}

// Convenience re-exports so feature code imports i18n from one place.
export { useTranslation, Trans } from "react-i18next";
