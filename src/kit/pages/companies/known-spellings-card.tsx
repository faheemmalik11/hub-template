import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { readableErrorMessage } from "../../components/feedback/query-states";
import {
  aliasAlreadyExistsError,
  aliasClaimedByAnotherEntityError,
  type CompaniesAdapter,
  type CompanyAlias,
} from "../../adapters/companies";
import type { CompaniesLabels } from "./labels";

// The same fold the backend's uniqueness check uses, so both agree on what a duplicate is.
function foldedSpelling(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function KnownSpellingsCard({
  adapter,
  companyCode,
  labels,
  className,
}: {
  adapter: CompaniesAdapter;
  companyCode: string;
  labels: CompaniesLabels["aliases"];
  className?: string;
}) {
  const aliasesQuery = adapter.useCompanyAliases(companyCode);
  const [newAlias, setNewAlias] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingAliasId, setRemovingAliasId] = useState<string | null>(null);

  const activeAliases = useMemo(
    () => (aliasesQuery.data ?? []).filter((alias) => alias.isActive),
    [aliasesQuery.data],
  );

  async function addAlias() {
    const value = newAlias.trim();
    if (activeAliases.some((alias) => foldedSpelling(alias.alias) === foldedSpelling(value))) {
      toast.error(labels.alreadyExistsToast);
      return;
    }
    setIsAdding(true);
    try {
      await adapter.addCompanyAlias({ companyCode, alias: value });
      setNewAlias("");
      toast.success(labels.addedToast(value));
    } catch (error) {
      const reason = readableErrorMessage(error, "");
      if (reason === aliasClaimedByAnotherEntityError) {
        toast.error(labels.claimedByOtherToast(value));
      } else if (reason === aliasAlreadyExistsError) {
        toast.error(labels.alreadyExistsToast);
      } else {
        toast.error(labels.addFailedToast(reason));
      }
    } finally {
      setIsAdding(false);
    }
  }

  async function removeAlias(alias: CompanyAlias) {
    setRemovingAliasId(alias.id);
    try {
      await adapter.removeCompanyAlias({ aliasId: alias.id });
      toast.success(labels.removedToast(alias.alias));
    } catch (error) {
      toast.error(labels.addFailedToast(readableErrorMessage(error, "")));
    } finally {
      setRemovingAliasId(null);
    }
  }

  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.title}
        </h2>
        {activeAliases.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {labels.count(activeAliases.length)}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{labels.hint}</p>

      <div className="mb-3 flex items-center gap-2">
        <Input
          value={newAlias}
          onChange={(event) => setNewAlias(event.target.value)}
          placeholder={labels.placeholder}
          className="text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter" && newAlias.trim()) event.currentTarget.blur();
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={!newAlias.trim() || isAdding}
          onClick={addAlias}
        >
          <Plus className="size-3.5" /> {labels.add}
        </Button>
      </div>

      <ul className="max-h-[18rem] space-y-1.5 overflow-y-auto pr-1">
        {activeAliases.map((alias) => (
          <li
            key={alias.id}
            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs"
          >
            <span className="min-w-0 truncate text-foreground">{alias.alias}</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-destructive"
                  aria-label={labels.remove}
                >
                  <X className="size-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {labels.confirmDescription(alias.alias)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{labels.confirmCancel}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={removingAliasId === alias.id}
                    onClick={() => removeAlias(alias)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {labels.confirmRemove}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ))}
        {activeAliases.length === 0 && (
          <li className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            {labels.empty}
          </li>
        )}
      </ul>
    </section>
  );
}
