import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function ExpandableNote({ text, className }: { text: string; className?: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !expanded) setOverflowing(element.scrollHeight > element.clientHeight + 1);
  }, [text, expanded]);

  return (
    <div className={cn("flex items-start gap-1", className)}>
      <p
        ref={ref}
        className={cn(
          "min-w-0 flex-1 break-words text-xs text-muted-foreground",
          !expanded && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-label={expanded ? t("brokerBonuses.collapseNote") : t("brokerBonuses.expandNote")}
          title={expanded ? t("brokerBonuses.collapseNote") : t("brokerBonuses.expandNote")}
          className="mt-0.5 shrink-0 rounded text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      )}
    </div>
  );
}
