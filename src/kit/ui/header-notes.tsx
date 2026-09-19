import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Bookmark, Plus } from "lucide-react";

import { Button } from "./button";
import { Skeleton } from "./skeleton";
import { Textarea } from "./textarea";

export interface HeaderNote {
  id: string | number;
  text: string;
  /** Rendered as-is, e.g. an already-formatted "actor · date" string. */
  meta: ReactNode;
}

export interface HeaderNotesLabels {
  title: string;
  add: string;
  placeholder: string;
  cancel: string;
  save: string;
  empty: string;
  /** The "N more" link. Called with how many notes are hidden beyond what is shown. */
  more: (hiddenCount: number) => string;
}

/**
 * The newest few notes on a record, read where they are added rather than three tabs away, with
 * a way to write one and a link to the rest.
 *
 * State lives with the caller: `draft`/`onDraftChange` is the textarea's own value, and saving,
 * loading and the full note list are all callbacks and props rather than a query this holds
 * itself. That keeps the component ignorant of what a "note" is attached to.
 */
export function HeaderNotes({
  labels,
  notes,
  totalCount,
  loading = false,
  draft,
  onDraftChange,
  onSave,
  saving = false,
  onMoreClick,
  className,
}: {
  labels: HeaderNotesLabels;
  /** The notes to show, already trimmed to however many the caller wants visible. */
  notes: HeaderNote[];
  /** How many notes exist in total. Drives the "N more" link; equal to `notes.length` when there is no overflow. */
  totalCount: number;
  loading?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  /** Only rendered when `totalCount` exceeds `notes.length`. */
  onMoreClick?: () => void;
  className?: string;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const hiddenCount = totalCount - notes.length;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bookmark className="size-4 text-brand-dark" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-dark">
            {labels.title}
          </h2>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-dark hover:underline"
          >
            <Plus className="size-3.5" aria-hidden />
            {labels.add}
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mt-3">
          <Textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={labels.placeholder}
            rows={2}
            className="w-full"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onDraftChange("");
                setFormOpen(false);
              }}
            >
              {labels.cancel}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSave();
                setFormOpen(false);
              }}
              disabled={!draft.trim() || saving}
            >
              {labels.save}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : notes.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {notes.map((note) => (
            <li key={note.id}>
              <p className="whitespace-pre-wrap text-base text-foreground">{note.text}</p>
              <p className="mt-1 text-sm text-muted-foreground">{note.meta}</p>
            </li>
          ))}
        </ol>
      ) : formOpen ? null : (
        <p className="mt-2 text-sm text-muted-foreground">{labels.empty}</p>
      )}

      {hiddenCount > 0 && onMoreClick && (
        <button
          type="button"
          onClick={onMoreClick}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-dark hover:underline"
        >
          {labels.more(hiddenCount)}
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
