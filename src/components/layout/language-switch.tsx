import { FLAGS, useLocale, useTranslation, LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Small, unobtrusive DE / EN segmented control for the header. Works in every environment;
// German stays the default. The choice is persisted in localStorage (hub.locale).
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("app.language")}
      className={cn("inline-flex rounded-md bg-muted p-0.5", className)}
    >
      {LOCALES.map((code: Locale) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1 cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-medium uppercase transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span aria-hidden>{FLAGS[code]}</span>
            {code}
          </button>
        );
      })}
    </div>
  );
}
