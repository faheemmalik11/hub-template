import type { ComponentType, ReactNode } from "react";
import { MoreVertical } from "lucide-react";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export interface IconMenuItem {
  /** Stable key, and what `onSelect` receives. */
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  disabled?: boolean;
  /** Draws it as a warning. For a step that leaves the record in a different state, not a routine one. */
  destructive?: boolean;
  /** A rule above this item, for grouping a menu into sections. */
  separatorBefore?: boolean;
}

/**
 * A ⋮ button that opens a menu of rare, secondary actions.
 *
 * For document-level controls that would otherwise crowd a header: sized for the few people who
 * ever press them, rather than the header being sized for four buttons most people never use.
 *
 * Items are a plain list, so which actions exist, in what order, and whether one is currently
 * legal all stay the caller's decision — build the array conditionally and this renders whatever
 * comes out. A confirmation dialog for a destructive item is the caller's too: render it
 * separately, controlled by state `onSelect` sets, rather than nested in the menu — a menu item
 * unmounts on select, which would take a nested dialog down with it before it could open.
 */
export function IconMenu({
  items,
  onSelect,
  label,
  className,
}: {
  items: IconMenuItem[];
  onSelect: (id: string) => void;
  /** The trigger's accessible name. */
  label: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={label} className={className}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-64 [&_[role=menuitem]]:whitespace-nowrap"
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id}>
              {item.separatorBefore && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className={
                  item.destructive
                    ? "cursor-pointer text-destructive focus:text-destructive"
                    : "cursor-pointer"
                }
                disabled={item.disabled}
                onSelect={() => onSelect(item.id)}
              >
                <Icon className="size-4" /> {item.label}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
