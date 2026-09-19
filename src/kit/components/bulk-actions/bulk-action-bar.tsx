import { useState, type ComponentType } from "react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Combobox, type ComboboxOption } from "../../ui/combobox";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { readableErrorMessage } from "../feedback/query-states";
import { runBulkAction } from "./run-bulk-action";
import type { BulkActionResult } from "./run-bulk-action";

/** A free-text value the user types once and every selected row receives, such as a reason. */
export interface BulkActionTextInput {
  kind: "text";
  label: string;
  placeholder?: string;
  required?: boolean;
}

/** A value picked from a list, such as the company every selected row should be assigned to. */
export interface BulkActionChoiceInput {
  kind: "choice";
  label: string;
  placeholder?: string;
  options: ComboboxOption[];
  required?: boolean;
}

export type BulkActionInput = BulkActionTextInput | BulkActionChoiceInput;

export interface BulkAction {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "destructive";
  disabled?: boolean;
  /** Set either of these, or an input, to ask before the action runs. */
  confirmTitle?: string;
  confirmDescription?: string;
  input?: BulkActionInput;
  /** Called once per selected row. */
  run: (id: string, value: string | null) => Promise<void>;
}

export interface BulkActionBarLabels {
  selectedCount: (count: number) => string;
  clearSelection: string;
  cancel: string;
  confirm: string;
  running: string;
  done: (count: number) => string;
  partlyDone: (succeeded: number, failed: number) => string;
  failed: (message: string) => string;
}

export const englishBulkActionBarLabels: BulkActionBarLabels = {
  selectedCount: (count) => `${count} selected`,
  clearSelection: "Clear selection",
  cancel: "Cancel",
  confirm: "Apply",
  running: "Working...",
  done: (count) => `${count} updated`,
  partlyDone: (succeeded, failed) => `${succeeded} updated, ${failed} failed`,
  failed: (message) => `Nothing was changed. ${message}`,
};

/**
 * The bar that appears once rows are ticked, and applies one action to all of them.
 *
 * It sits above the table rather than floating, so it never covers a row the user is reading.
 */
export function BulkActionBar({
  selectedIds,
  actions,
  labels,
  onClear,
  onFinished,
}: {
  selectedIds: string[];
  actions: BulkAction[];
  labels: BulkActionBarLabels;
  onClear: () => void;
  /** Runs after every attempt, successful or not. Use it to refresh the list. */
  onFinished?: (result: BulkActionResult, actionKey: string) => void;
}) {
  const [openAction, setOpenAction] = useState<BulkAction | null>(null);
  const [value, setValue] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  if (selectedIds.length === 0) return null;

  function start(action: BulkAction) {
    if (action.input || action.confirmTitle) {
      setValue("");
      setOpenAction(action);
      return;
    }
    void apply(action, null);
  }

  async function apply(action: BulkAction, actionValue: string | null) {
    setIsRunning(true);
    const result = await runBulkAction(selectedIds, action.run, actionValue);
    setIsRunning(false);
    setOpenAction(null);

    if (result.succeeded === 0)
      toast.error(labels.failed(readableErrorMessage(result.firstError, "")));
    else if (result.failed > 0) toast.warning(labels.partlyDone(result.succeeded, result.failed));
    else toast.success(labels.done(result.succeeded));

    onClear();
    onFinished?.(result, action.key);
  }

  const input = openAction?.input;
  const valueMissing = Boolean(input?.required) && value.trim() === "";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5">
      <span className="text-sm font-medium text-foreground">
        {labels.selectedCount(selectedIds.length)}
      </span>
      {actions.map((action) => (
        <Button
          key={action.key}
          size="sm"
          variant="outline"
          className={action.tone === "destructive" ? "text-destructive" : undefined}
          disabled={action.disabled || isRunning}
          onClick={() => start(action)}
        >
          {action.icon && <action.icon className="size-4" />}
          {action.label}
        </Button>
      ))}
      <Button size="sm" variant="ghost" disabled={isRunning} onClick={onClear}>
        {labels.clearSelection}
      </Button>

      <AlertDialog open={openAction !== null} onOpenChange={(open) => !open && setOpenAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{openAction?.confirmTitle ?? openAction?.label}</AlertDialogTitle>
            {openAction?.confirmDescription && (
              <AlertDialogDescription>{openAction.confirmDescription}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          {input && (
            <div className="grid gap-2">
              <Label htmlFor="bulk-action-value">{input.label}</Label>
              {input.kind === "text" ? (
                <Textarea
                  id="bulk-action-value"
                  value={value}
                  placeholder={input.placeholder}
                  onChange={(event) => setValue(event.target.value)}
                />
              ) : (
                <Combobox
                  id="bulk-action-value"
                  value={value}
                  options={input.options}
                  placeholder={input.placeholder}
                  onValueChange={setValue}
                />
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRunning}>{labels.cancel}</AlertDialogCancel>
            <Button
              disabled={isRunning || valueMissing}
              onClick={() => openAction && void apply(openAction, value.trim() || null)}
            >
              {isRunning ? labels.running : labels.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
