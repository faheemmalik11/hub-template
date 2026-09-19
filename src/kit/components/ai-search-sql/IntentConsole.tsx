import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/class-names";
import type { IntentClassification } from "../../lib/ai-search-sql/types";
import { englishIntentConsoleLabels, type IntentConsoleLabels } from "./labels";

export interface IntentConsoleProps {
  question?: string | null;
  result?: IntentClassification | null;
  sql?: string | null;
  rejectedWhereClause?: string | null;
  unsupportedAspects?: string[];
  offTopic?: boolean;
  pending?: boolean;
  error?: string | null;
  labels?: IntentConsoleLabels;
  className?: string;
}

export function IntentConsole({
  question,
  result,
  sql,
  rejectedWhereClause,
  unsupportedAspects = [],
  offTopic = false,
  pending = false,
  error,
  labels = englishIntentConsoleLabels,
  className,
}: IntentConsoleProps) {
  const [copied, setCopied] = useState(false);

  const copySql = async () => {
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn("rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs", className)}
    >
      <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
        <Terminal className="size-3.5" />
        {labels.title}
      </div>
      {question && <div className="mt-2 break-words text-muted-foreground">&gt; {question}</div>}
      {pending && <div className="mt-1 text-muted-foreground">{labels.pending}</div>}
      {error && <div className="mt-1 text-destructive">{error}</div>}
      {result && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      {offTopic && !pending && <div className="mt-2 text-muted-foreground">{labels.offTopic}</div>}
      {unsupportedAspects.length > 0 && (
        <div className="mt-2 text-amber-700">
          {labels.unsupported} {unsupportedAspects.join("; ")}
        </div>
      )}
      {rejectedWhereClause && (
        <div className="mt-2 text-destructive">
          {labels.rejectedClause} {rejectedWhereClause}
        </div>
      )}
      {sql && (
        <div className="mt-3 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-muted-foreground">{labels.sqlTitle}</span>
            <button
              type="button"
              onClick={copySql}
              className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? labels.copied : labels.copySql}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-foreground">{sql}</pre>
        </div>
      )}
      {!question && !pending && !error && !result && (
        <div className="mt-2 text-muted-foreground">{labels.empty}</div>
      )}
    </div>
  );
}
