import { useMutation } from "@tanstack/react-query";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { VoiceSearchButton } from "@/components/belege/voice-search-button";
import {
  searchInvoicesByQuestion,
  type InvoiceSearchOutcome,
} from "@/lib/api/invoice-intent.functions";
import { cn } from "@/lib/utils";

const AI_SEARCH_STORAGE_KEY = "belege.aiSearch";

interface StoredAiSearch {
  question: string;
  outcome: InvoiceSearchOutcome;
}

export function clearStoredAiSearch() {
  storeAiSearch(null);
}

export function readStoredAiSearch(): StoredAiSearch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AI_SEARCH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAiSearch) : null;
  } catch {
    return null;
  }
}

function storeAiSearch(value: StoredAiSearch | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(AI_SEARCH_STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(AI_SEARCH_STORAGE_KEY);
  } catch {
    return;
  }
}

export interface IntentConsolePanelLabels {
  title: string;
  description: string;
  placeholder: string;
  close: string;
  searching: string;
  error: string;
  offTopic: string;
  found(count: number): string;
  noResults: string;
  notApplied(aspects: string): string;
  clear: string;
}

export function IntentConsolePanel({
  className,
  labels,
  suggestions = [],
  appliedFilters,
  onResults,
  onClose,
}: {
  className?: string;
  labels: IntentConsolePanelLabels;
  suggestions?: string[];
  appliedFilters?(outcome: InvoiceSearchOutcome): ReactNode | null;
  onResults(ids: string[] | null): void;
  onClose(): void;
}) {
  const [stored] = useState(() => readStoredAiSearch());
  const [question, setQuestion] = useState(stored?.question ?? "");
  const [restoredOutcome, setRestoredOutcome] = useState(stored?.outcome ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useMutation({
    mutationFn: (query: string): Promise<InvoiceSearchOutcome> =>
      searchInvoicesByQuestion({ data: { query } }),
    onSuccess: (outcome, query) => {
      setRestoredOutcome(null);
      storeAiSearch({ question: query, outcome });
      onResults(outcome.ids);
    },
  });

  const submit = (raw: string) => {
    const query = raw.trim();
    if (!query || search.isPending) return;
    search.mutate(query);
  };

  const clear = () => {
    setQuestion("");
    search.reset();
    setRestoredOutcome(null);
    storeAiSearch(null);
    onResults(null);
  };

  const outcome = search.data ?? restoredOutcome;
  const offTopic = outcome?.preview.classification.intent === "off_topic";
  const appliedLine = outcome && !offTopic && appliedFilters ? appliedFilters(outcome) : null;

  return (
    <div className={cn("rounded-xl border border-border bg-brand-tint p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-brand-dark">
          <Sparkles className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{labels.title}</h2>
          <p className="text-xs text-muted-foreground">{labels.description}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            clear();
            onClose();
          }}
          className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-brand-dark transition-colors hover:bg-brand-wash"
        >
          <Sparkles className="size-4" />
          {labels.close}
          <X className="ml-0.5 size-3.5 text-muted-foreground" />
        </button>
      </div>
      <form
        className="relative mt-3 w-full"
        onSubmit={(event) => {
          event.preventDefault();
          submit(question);
        }}
      >
        <Input
          ref={inputRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={labels.placeholder}
          className="h-11 bg-card pr-28"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {(question || outcome) && (
            <button
              type="button"
              onClick={clear}
              aria-label={labels.clear}
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          <VoiceSearchButton
            onTranscribed={(text) => {
              setQuestion(text);
              inputRef.current?.focus();
            }}
          />
          <button
            type="submit"
            disabled={!question.trim() || search.isPending}
            aria-label={labels.title}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {search.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
      </form>
      {suggestions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuestion(suggestion);
                submit(suggestion);
              }}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      {(search.isPending || search.isError || outcome) && (
        <div className="mt-3 border-t border-border/60 pt-3 text-sm">
          {search.isPending && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {labels.searching}
            </span>
          )}
          {search.isError && <span className="text-destructive">{labels.error}</span>}
          {outcome && offTopic && <span className="text-foreground">{labels.offTopic}</span>}
          {outcome && !offTopic && (
            <span className={appliedLine ? "text-muted-foreground" : "text-foreground"}>
              {outcome.ids && outcome.ids.length > 0
                ? (appliedLine ?? labels.found(outcome.ids.length))
                : labels.noResults}
            </span>
          )}
          {outcome && !offTopic && outcome.preview.unsupportedAspects.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              {labels.notApplied(outcome.preview.unsupportedAspects.join("; "))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
