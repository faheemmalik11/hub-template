import { useTranslation } from "./adapter";
import { parseSendError } from "./model";

/**
 * A failed send in the selected language, with the technical detail underneath for whoever has to
 * look into it. Text without a known code (older history rows, a plain permission error) is shown
 * as it is, so nothing is ever hidden behind a translation that does not exist.
 */
export function SendErrorText({ raw, className }: { raw: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const { code, detail } = parseSendError(raw);
  if (!code) return <p className={className}>{raw}</p>;
  const key = `handover.fehler.${code}`;
  const known = i18n.exists(key);
  return (
    <div className={className}>
      <p className="break-words">{known ? t(key) : t("handover.fehler.SEND_FAILED")}</p>
      {detail && (
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t("handover.fehler.details")}</summary>
          <p className="mt-1 break-words">{detail}</p>
        </details>
      )}
    </div>
  );
}
