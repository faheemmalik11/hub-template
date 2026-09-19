import { Search } from "lucide-react";

import { Input } from "../../ui/input";
import { cn } from "../../lib/class-names";

export function SearchInput({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="pl-9"
      />
    </div>
  );
}
