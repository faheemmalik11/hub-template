import { CopyButton as KitCopyButton } from "@hub-kit/core/ui";

import { useTranslation } from "@/lib/i18n";

/**
 * The kit's copy button, wearing this app's German wording.
 *
 * The kit holds no rendered strings, so the three labels are supplied here. `label` names what is
 * being copied ("IBAN") and is folded into all of them; without it the wording stays generic.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <KitCopyButton
      value={value}
      className={className}
      labels={{
        action: label ? t("common.copy.action", { label }) : t("common.copy.actionGeneric"),
        copied: label ? t("common.copy.copied", { label }) : t("common.copy.copiedGeneric"),
        failed: t("common.copy.failed"),
      }}
    />
  );
}
