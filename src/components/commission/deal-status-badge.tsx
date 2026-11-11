import { Badge } from "@/components/ui/badge";
import type { DealStatus } from "@/data";
import { DEAL_STATUS_META } from "@/lib/data/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap font-medium", DEAL_STATUS_META[status]?.cls)}
    >
      {t(`commissionDeals.status.${status}`)}
    </Badge>
  );
}
