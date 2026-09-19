import type { ComponentType } from "react";

import { cn } from "../lib/class-names";
import { Button } from "./button";

export interface ActionButtonSpec {
  /** Stable key, and what `onAction` is called with. */
  id: string;
  icon: ComponentType<{ className?: string }>;
  /** The button's own text. */
  label: string;
  /** Draws it as a warning. For a step that leaves the happy path, not merely one that changes state. */
  destructive?: boolean;
}

/**
 * A run of secondary actions, each an icon beside a word.
 *
 * Renders the buttons only, no container, so the caller decides how they sit in its own row.
 * Every string is the caller's: this holds no text and knows nothing about what the actions mean.
 */
export function ActionButtons({
  actions,
  onAction,
  disabled = false,
  className,
}: {
  actions: ActionButtonSpec[];
  onAction: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onAction(action.id)}
            className={cn(
              "gap-2",
              action.destructive &&
                "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
              className,
            )}
          >
            <Icon className="size-4" />
            {action.label}
          </Button>
        );
      })}
    </>
  );
}
