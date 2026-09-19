import { useState } from "react";

import type { FieldOption, RunNowFolder, SourceField } from "../../adapters/document-sources";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { cn } from "../../lib/class-names";
import { englishDocumentSourcesLabels, type DocumentSourcesLabels } from "./labels";
import { FieldControl } from "./SourceSettingsSheet";

type Mode = "default" | "folders";

/** Every option in a possibly nested folder list, so a picked id can carry the name it was shown as. */
function namesById(options: FieldOption[] | undefined): Map<string, string> {
  const names = new Map<string, string>();
  const walk = (list: FieldOption[]) => {
    for (const option of list) {
      if (option.value) names.set(option.value, option.label);
      walk(option.children ?? []);
    }
  };
  walk(options ?? []);
  return names;
}

/**
 * Run one channel now: its usual folders, or a set picked for this run only.
 *
 * Nothing is remembered between opens. The choice lives in RunNowBody, which exists only while the
 * dialog is open, so every open starts on the usual folders with nothing picked — however it was
 * closed last time. A folder set is a one-off ask, and a stale one reappearing could send somebody
 * to re-read an archive they never meant to.
 */
export function RunNowDialog({
  open,
  onOpenChange,
  sourceName,
  folderField,
  labels,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  folderField: SourceField;
  labels: DocumentSourcesLabels;
  /** Null for the usual folders; otherwise the folders picked, with the names they were shown as. */
  onStart: (folders: RunNowFolder[] | null) => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => !starting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <RunNowBody
            sourceName={sourceName}
            folderField={folderField}
            labels={labels}
            starting={starting}
            onCancel={() => onOpenChange(false)}
            onStart={async (folders) => {
              setStarting(true);
              try {
                await onStart(folders);
                onOpenChange(false);
              } finally {
                setStarting(false);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RunNowBody({
  sourceName,
  folderField,
  labels,
  starting,
  onCancel,
  onStart,
}: {
  sourceName: string;
  folderField: SourceField;
  labels: DocumentSourcesLabels;
  starting: boolean;
  onCancel: () => void;
  onStart: (folders: RunNowFolder[] | null) => Promise<void>;
}) {
  const text = labels.runNowDialog ?? englishDocumentSourcesLabels.runNowDialog!;
  // Fresh on every mount, which is every open: see RunNowDialog.
  const [mode, setMode] = useState<Mode>("default");
  const [picked, setPicked] = useState<string[]>([]);

  const nothingPicked = mode === "folders" && picked.length === 0;

  function start() {
    const names = namesById(folderField.options);
    void onStart(
      mode === "folders" ? picked.map((id) => ({ id, name: names.get(id) ?? id })) : null,
    );
  }

  const option = (value: Mode, title: string, hint: string) => (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
      )}
    >
      <input
        type="radio"
        name="run-now-mode"
        className="mt-1 size-4 accent-[var(--color-primary)]"
        checked={mode === value}
        onChange={() => setMode(value)}
        disabled={starting}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{text.title(sourceName)}</DialogTitle>
        <DialogDescription>{text.description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        {option("default", text.defaultRun, text.defaultRunHint)}
        {option("folders", text.chosenFolders, text.chosenFoldersHint)}
      </div>

      {mode === "folders" && (
        <FieldControl
          // Always many: one run may read several archive folders at once. Starts empty, never
          // from the channel's configured folders: this set is only what was picked for this run.
          field={{ ...folderField, kind: "multiSelect", value: [] }}
          value={picked}
          onChange={(next) => setPicked(Array.isArray(next) ? next : next ? [String(next)] : [])}
          labels={labels}
        />
      )}

      <p className="text-xs text-muted-foreground">{text.limits}</p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={starting}>
          {text.cancel}
        </Button>
        <Button type="button" onClick={start} disabled={starting || nothingPicked}>
          {starting ? text.starting : text.start}
        </Button>
      </DialogFooter>
    </>
  );
}
