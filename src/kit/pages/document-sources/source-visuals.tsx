import type { SourceIcon, SourceStatus } from "../../adapters/document-sources";
import { cn } from "../../lib/class-names";
import type { DocumentSourcesLabels } from "./labels";

export function SourceIconBadge({ icon, className }: { icon: SourceIcon; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted",
        className,
      )}
    >
      {typeof icon === "object" && "imageSrc" in icon ? (
        <img src={icon.imageSrc} alt="" className="size-1/2 object-contain" />
      ) : (
        <IconGlyph icon={icon} />
      )}
    </span>
  );
}

export function StatusChip({
  status,
  labels,
}: {
  status: SourceStatus;
  labels: DocumentSourcesLabels;
}) {
  const text =
    status === "connected"
      ? labels.statusConnected
      : status === "not_connected"
        ? labels.statusNotConnected
        : labels.statusNotConfigured;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "connected" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "connected" ? "bg-success" : "bg-muted-foreground/50",
        )}
      />
      {text}
    </span>
  );
}

function IconGlyph({ icon }: { icon: Exclude<SourceIcon, { imageSrc: string }> }) {
  const Icon = icon;
  return <Icon className="size-1/2 text-muted-foreground" />;
}
