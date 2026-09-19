import { useState } from "react";
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
import type { PropertiesAdapter } from "../../adapters/properties";
import type { PropertiesLabels } from "./labels";

// The spellings this property is known by on documents; the pipeline resolves them to its code.
export function NameVariantsCard({
  propertyCode,
  adapter,
  labels,
}: {
  propertyCode: string;
  adapter: PropertiesAdapter;
  labels: PropertiesLabels["nameVariants"];
}) {
  const variantsQuery = adapter.useNameVariants(propertyCode);
  const [newVariant, setNewVariant] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const variants = variantsQuery.data ?? [];

  // Case and inner spacing only, so this check agrees with the server on what counts as the same.
  const folded = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

  async function addVariant() {
    const text = newVariant.trim();
    if (variants.some((variant) => folded(variant.text) === folded(text))) {
      toast.error(labels.alreadyExists);
      return;
    }
    setIsAdding(true);
    try {
      await adapter.addNameVariant({ propertyCode, text });
      setNewVariant("");
      toast.success(labels.added(text));
    } catch (error) {
      const reason = adapter.nameVariantRejectionReason(error);
      if (reason === "claimedByOther") toast.error(labels.claimedByOther(text));
      else if (reason === "alreadyExists") toast.error(labels.alreadyExists);
      else toast.error(labels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsAdding(false);
    }
  }

  async function removeVariant(variantId: string, text: string) {
    setIsRemoving(true);
    try {
      await adapter.removeNameVariant({ propertyCode, variantId });
      toast.success(labels.removed(text));
    } catch (error) {
      toast.error(labels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.title}
        </h2>
        {variants.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {labels.count(variants.length)}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{labels.hint}</p>

      <div className="mb-3 flex items-center gap-2">
        <Input
          value={newVariant}
          onChange={(event) => setNewVariant(event.target.value)}
          placeholder={labels.placeholder}
          className="text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter" && newVariant.trim()) event.currentTarget.blur();
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={!newVariant.trim() || isAdding}
          onClick={() => void addVariant()}
        >
          <Plus className="size-3.5" /> {labels.add}
        </Button>
      </div>

      <ul className="max-h-[18rem] space-y-1.5 overflow-y-auto pr-1">
        {variants.map((variant) => (
          <li
            key={variant.id}
            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs"
          >
            <span className="min-w-0 truncate text-foreground">{variant.text}</span>
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
                    {labels.confirmDescription(variant.text)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{labels.confirmCancel}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isRemoving}
                    onClick={() => void removeVariant(variant.id, variant.text)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {labels.confirmRemove}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ))}
        {variants.length === 0 && (
          <li className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            {labels.empty}
          </li>
        )}
      </ul>
    </section>
  );
}
