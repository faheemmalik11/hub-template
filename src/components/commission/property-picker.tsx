import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { propertyChoiceTitle, usePropertyChoices } from "@/data";
import type { PropertyChoice } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SEARCH_DELAY_MS = 250;

export function PropertyPicker({
  value,
  onChange,
}: {
  value: PropertyChoice | null;
  onChange: (property: PropertyChoice) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const choicesQ = usePropertyChoices(search, open);
  const properties = choicesQ.data?.pages.flat() ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = choicesQ;

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    const end = endRef.current;
    const list = listRef.current;
    if (!open || !end || !list || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { root: list },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage, properties.length]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full cursor-pointer justify-between whitespace-nowrap px-3 py-2 text-left font-normal shadow-none",
            !value && "text-muted-foreground",
          )}
        >
          <span className="min-w-0 truncate">
            {value
              ? propertyChoiceTitle(value)
              : t("commissionDeals.newDialog.propertyPlaceholder")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 opacity-50" />
          <Input
            className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t("commissionDeals.newDialog.propertySearch")}
            autoFocus
          />
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
          {properties.map((property) => (
            <button
              key={property.id}
              type="button"
              onClick={() => {
                onChange(property);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <Check
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  value?.id === property.id ? "text-brand opacity-100" : "opacity-0",
                )}
              />
              <span className="min-w-0">
                <span className="block truncate">
                  {propertyChoiceTitle(property)}
                  {property.crm_status && (
                    <span className="text-muted-foreground"> · {property.crm_status}</span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[property.address, property.code].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
          {properties.length === 0 && !choicesQ.isFetching && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("commissionDeals.newDialog.noProperties")}
            </p>
          )}
          <div ref={endRef} className="flex h-8 items-center justify-center">
            {(isFetchingNextPage || choicesQ.isFetching) && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
