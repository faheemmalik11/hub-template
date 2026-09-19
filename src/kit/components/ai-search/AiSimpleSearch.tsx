import { Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/class-names";
import { Input } from "../../ui/input";
import { englishAiSearchLabels, type AiSearchLabels } from "./labels";

export interface AiSimpleSearchProps {
  initialValue?: string;
  onApply(value: string | undefined): void;
  onOpenAssistant(): void;
  labels?: AiSearchLabels;
  debounceMs?: number;
  className?: string;
  tourId?: string;
}

export function AiSimpleSearch({
  initialValue = "",
  onApply,
  onOpenAssistant,
  labels = englishAiSearchLabels,
  debounceMs = 450,
  className,
  tourId,
}: AiSimpleSearchProps) {
  const [value, setValue] = useState(initialValue);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastApplied = useRef(initialValue.trim());

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (initialValue.trim() !== lastApplied.current) {
      lastApplied.current = initialValue.trim();
      setValue(initialValue);
    }
  }, [initialValue]);

  const change = (next: string) => {
    setValue(next);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      lastApplied.current = next.trim();
      onApply(next.trim() || undefined);
    }, debounceMs);
  };

  const clear = () => {
    setValue("");
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    lastApplied.current = "";
    onApply(undefined);
  };

  return (
    <div
      data-tour={tourId}
      className={cn(
        "flex h-9 w-full items-stretch overflow-hidden rounded-md border border-border bg-card focus-within:ring-1 focus-within:ring-ring sm:w-96",
        className,
      )}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => change(event.target.value)}
          placeholder={labels.simplePlaceholder}
          className="h-full rounded-none border-0 bg-transparent pl-9 pr-8 shadow-none focus-visible:ring-0"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label={labels.clear}
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenAssistant}
        className="flex shrink-0 items-center gap-1.5 border-l border-border bg-brand-tint px-3 text-sm font-medium text-brand-dark transition-colors hover:bg-brand-wash"
      >
        <Sparkles className="size-4" />
        {labels.assistant}
      </button>
    </div>
  );
}
