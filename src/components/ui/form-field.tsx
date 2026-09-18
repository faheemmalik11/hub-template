import { useTranslation } from "@/lib/i18n";

/**
 * The two pieces every form on this app needs and none of them had: a mark that says a field is
 * required, and a message that sits under the field it is about.
 *
 * Before this, a form said nothing about what it needed and answered a failed submit with a toast
 * that named one problem and disappeared in two seconds. Clicking the button and seeing nothing
 * happen is what that looks like from the outside.
 */
export function PflichtStern() {
  const { t } = useTranslation();
  return (
    <span className="text-destructive" title={t("common.form.pflichtfeld")} aria-hidden>
      *
    </span>
  );
}

export function FeldFehlerText({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-xs text-destructive">{text}</p>;
}
