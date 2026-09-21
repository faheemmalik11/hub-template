import { cn } from "../../lib/class-names";

const STATUS_TONE = new Map<string, string>([
  ["matched", "bg-emerald-100 text-emerald-800"],
  ["bestaetigt", "bg-emerald-100 text-emerald-800"],
  ["suggested", "bg-amber-100 text-amber-800"],
  ["vorschlag", "bg-amber-100 text-amber-800"],
  ["multiple", "bg-amber-100 text-amber-800"],
  ["ignored", "bg-muted text-muted-foreground"],
  ["ignoriert", "bg-muted text-muted-foreground"],
  ["unmatched", "bg-red-100 text-red-800"],
  ["open", "bg-red-100 text-red-800"],
]);

export function MatchStatusBadge({
  status,
  label,
}: {
  status: string | null;
  label: (status: string) => string;
}) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        STATUS_TONE.get(status) ?? "bg-muted text-muted-foreground",
      )}
    >
      {label(status)}
    </span>
  );
}

export function DirectionBadge({
  direction,
  className,
}: {
  direction: string | null;
  className?: string;
}) {
  if (!direction) return null;
  const outgoing = direction === "ausgehend" || direction === "outgoing";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        outgoing ? "bg-rose-100 text-rose-800" : "bg-teal-100 text-teal-800",
        className,
      )}
    >
      {outgoing ? "−" : "+"}
    </span>
  );
}
