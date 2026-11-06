import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSyncPropertyListings } from "@/data";
import { errorText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export function SyncPropertiesButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { t } = useTranslation();
  const sync = useSyncPropertyListings();

  const runSync = () =>
    sync.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(
          t("propertyListings.synced", { count: result.fetched, created: result.created }),
        ),
      onError: (error) =>
        toast.error(t("propertyListings.syncFailed"), { description: errorText(error) }),
    });

  return (
    <Button variant={variant} onClick={runSync} disabled={sync.isPending}>
      <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
      {sync.isPending ? t("propertyListings.syncing") : t("propertyListings.syncNow")}
    </Button>
  );
}
