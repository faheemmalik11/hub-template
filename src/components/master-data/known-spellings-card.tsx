import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAddEntityAlias,
  useDeactivateEntityAlias,
  useEntityAliases,
  type EntityAliasType,
} from "@/data";
import { errorText } from "@/lib/data/format";

/**
 * The spellings one entity is known by, as its own card.
 *
 * One component for companies, properties and suppliers, because the table behind it is one table
 * and the rules are the same for all three. It used to exist only on the supplier page, inline --
 * where it mattered least: the pipeline's resolver reads 'gesellschaft' and 'objekt' aliases to map
 * a name on a document to a code, and never reads 'lieferant' ones at all.
 *
 * `entityCode` is the CODE for companies and properties ('IMKO', 'DO-SUM') and the uuid for
 * suppliers, matching what entity_aliases.entity_code holds for each type.
 */
export function KnownSpellingsCard({
  entityType,
  entityCode,
  className,
  /**
   * Draw the card's outline.
   *
   * Off where the surrounding sections have none: on the supplier page the neighbouring cards are
   * plain `rounded-xl bg-card`, so an outlined card among them reads as a different kind of thing
   * rather than as one more section.
   */
  frame = true,
}: {
  entityType: EntityAliasType;
  entityCode: string;
  className?: string;
  frame?: boolean;
}) {
  const { t } = useTranslation();
  const aliasesQ = useEntityAliases(entityType, entityCode);
  const addAlias = useAddEntityAlias(entityType, entityCode);
  const deactivateAlias = useDeactivateEntityAlias(entityType, entityCode);
  const [newerAlias, setNewerAlias] = useState("");

  const active = useMemo(() => (aliasesQ.data ?? []).filter((a) => a.is_active), [aliasesQ.data]);

  // Case and inner spacing only -- the same fold entity_aliases_one_owner_uniq uses, so the
  // client-side duplicate check and the database's agree on what counts as the same spelling.
  const folded = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  return (
    <section
      className={`rounded-xl bg-card p-5 ${frame ? "border border-border" : ""} ${className ?? ""}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("aliases.title")}
        </h2>
        {active.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("aliases.anzahl", { count: active.length })}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t(`aliases.hinweis.${entityType}`)}</p>

      <div className="mb-3 flex items-center gap-2">
        <Input
          value={newerAlias}
          onChange={(e) => setNewerAlias(e.target.value)}
          placeholder={t("aliases.placeholder")}
          className="text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newerAlias.trim()) e.currentTarget.blur();
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={!newerAlias.trim() || addAlias.isPending}
          onClick={() => {
            const value = newerAlias.trim();
            // Checked here first so an exact duplicate on THIS entity reads as a sentence rather
            // than a round-trip and a constraint name. A spelling another entity holds cannot be
            // checked from here -- that needs the whole table -- so it comes back as ALIAS_CLAIMED.
            if (active.some((a) => folded(a.alias) === folded(value))) {
              toast.error(t("aliases.toast.bereitsVorhanden"));
              return;
            }
            addAlias.mutate(value, {
              onSuccess: () => {
                setNewerAlias("");
                toast.success(t("aliases.toast.hinzugefuegt", { alias: value }));
              },
              onError: (e) => {
                const reason = errorText(e);
                if (reason === "ALIAS_CLAIMED") {
                  toast.error(t("aliases.toast.beanspruchtVonAnderer", { alias: value }));
                } else if (reason === "ALIAS_EXISTS") {
                  toast.error(t("aliases.toast.bereitsVorhanden"));
                } else {
                  toast.error(t("aliases.toast.fehlgeschlagen", { error: reason }));
                }
              },
            });
          }}
        >
          <Plus className="size-3.5" /> {t("aliases.hinzufuegen")}
        </Button>
      </div>

      <ul className="max-h-[18rem] space-y-1.5 overflow-y-auto pr-1">
        {active.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs"
          >
            <span className="min-w-0 truncate text-foreground">{a.alias}</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-destructive"
                  aria-label={t("aliases.entfernen")}
                >
                  <X className="size-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("aliases.confirm.title")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("aliases.confirm.desc", { alias: a.alias })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("aliases.confirm.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      deactivateAlias.mutate(a.id, {
                        onSuccess: () =>
                          toast.success(t("aliases.toast.entfernt", { alias: a.alias })),
                        onError: (e) =>
                          toast.error(t("aliases.toast.fehlgeschlagen", { error: errorText(e) })),
                      })
                    }
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t("aliases.confirm.confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ))}
        {active.length === 0 && (
          <li className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            {t("aliases.empty")}
          </li>
        )}
      </ul>
    </section>
  );
}
