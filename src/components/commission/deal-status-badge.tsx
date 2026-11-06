import { Badge } from "@/components/ui/badge";
import type { DealStatus } from "@/data";
import { useTranslation } from "@/lib/i18n";

const VARIANT: Record<DealStatus, "default" | "secondary" | "outline"> = {
  incomplete: "outline",
  ready: "secondary",
  approved: "default",
  invoiced: "default",
  cancelled: "outline",
};

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={VARIANT[status]} className="whitespace-nowrap">
      {t(`commissionDeals.status.${status}`)}
    </Badge>
  );
}
