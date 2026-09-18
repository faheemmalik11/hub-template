import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useBwaCategories,
  useCreateBwaCategory,
  useSoftDeleteBwaCategory,
  useUpdateBwaCategory,
  type BwaCategoryInput,
} from "@/lib/data/queries";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { useTranslation } from "@/lib/i18n";
import type { BwaCategory } from "@/lib/data/types";
import { LEER } from "@/components/zuordnung/regel-zeile";
import { pageTitle } from "@/lib/brand";
import { fehlerText } from "@/lib/data/format";

export const Route = createFileRoute("/kategorien/")({
  head: () => ({ meta: [{ title: pageTitle("Kategorien") }] }),
  component: KategorienPage,
});

function KategorienPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("kategorien.list.title")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("kategorien.list.subtitle")}
      </p>

      <div data-tour="assignment-categories" className="mt-6">
        <KategorienTab />
      </div>
    </div>
  );
}

function KategorienTab() {
  const { t } = useTranslation();
  const categoriesQ = useBwaCategories();
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [suche, setSuche] = useState("");
  const coarse = useMemo(
    () => categories.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );
  const childrenOf = useMemo(() => {
    const m = new Map<string, BwaCategory[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      const list = m.get(c.parent_id) ?? [];
      list.push(c);
      m.set(c.parent_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [categories]);

  // Filtering a two-level tree, not a flat list, so a match has two shapes. A group whose own name
  // or note matches keeps ALL of its children -- searching "Raumkosten" should show that group
  // whole, not an empty one. A group that only matches through a child shows just the children
  // that matched, and is force-opened at the render sites below: a result you cannot see is not a
  // result. Drag order is untouched -- `coarse` is already in sort_order and this only removes
  // rows from it.
  const q = suche.trim().toLowerCase();
  const treffer = useMemo(() => {
    const passt = (c: BwaCategory) => `${c.name} ${c.note ?? ""}`.toLowerCase().includes(q);
    const out: { group: BwaCategory; kids: BwaCategory[]; nurKind: boolean }[] = [];
    for (const group of coarse) {
      const kids = childrenOf.get(group.id) ?? [];
      if (!q || passt(group)) {
        out.push({ group, kids, nurKind: false });
        continue;
      }
      const kinder = kids.filter(passt);
      if (kinder.length > 0) out.push({ group, kids: kinder, nurKind: true });
    }
    return out;
  }, [coarse, childrenOf, q]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("kategorien.hinweis")}</p>
        <NeueKategorieDialog categories={categories} />
      </div>

      {/* ~19 coarse groups today, several with double-digit child counts, and no way to jump to
          one by name. Same client-side bar the other master-data tables use. */}
      <div className="relative mt-4 w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder={t("kategorien.suche")}
          className="pl-9"
        />
      </div>

      {categoriesQ.isError ? (
        <div className="mt-6">
          <ErrorState error={categoriesQ.error} onRetry={() => categoriesQ.refetch()} />
        </div>
      ) : categoriesQ.isLoading ? (
        <div className="mt-6">
          <TableSkeleton rows={8} cols={3} />
        </div>
      ) : coarse.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          {t("kategorien.leer")}
        </p>
      ) : (
        <>
          <div className="mt-6 hidden rounded-xl border border-border sm:block overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("kategorien.col.name")}</TableHead>
                  <TableHead>{t("kategorien.col.hinweis")}</TableHead>
                  <TableHead className="text-right">{t("kategorien.col.aktionen")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {treffer.map(({ group, kids, nurKind }) => {
                  // Force-opened when the group itself did not match: the row that matched is a
                  // child, so collapsing it would hide the only reason this group is on screen.
                  const isOpen = expanded.has(group.id) || nurKind;
                  return (
                    <Fragment key={group.id}>
                      <TableRow className={cn(!group.is_active && "opacity-60")}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggle(group.id)}
                              className="flex items-center gap-1.5 font-medium text-foreground"
                            >
                              <span className="text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
                              {group.name}
                              <span className="text-xs font-normal text-muted-foreground">
                                ({kids.length})
                              </span>
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {group.note}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* The spec's "+ on a parent adds a subcategory beneath it". */}
                            <NeueKategorieDialog
                              categories={categories}
                              presetParentId={group.id}
                            />
                            <KategorieAktionen kategorie={group} />
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen
                        ? kids.map((k) => (
                            <TableRow key={k.id} className={cn(!k.is_active && "opacity-60")}>
                              <TableCell className="pl-8 text-sm text-foreground">
                                {k.name}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {k.note}
                              </TableCell>
                              <TableCell className="text-right">
                                <KategorieAktionen kategorie={k} />
                              </TableCell>
                            </TableRow>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Below `sm`: one card per top-level category, children nested inside when expanded. */}
          <div className="mt-6 space-y-3 sm:hidden">
            {treffer.map(({ group, kids, nurKind }) => {
              const isOpen = expanded.has(group.id) || nurKind;
              return (
                <div
                  key={group.id}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4",
                    !group.is_active && "opacity-60",
                  )}
                >
                  {/* Name on its own full-width row (wraps rather than truncates — the actions
                      below used to sit alongside it and crowded even mid-length names down to a
                      few characters plus an ellipsis) and the actions on the row underneath. */}
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    className="flex w-full items-start gap-1.5 text-left font-medium text-foreground"
                  >
                    <span className="mt-px shrink-0 text-muted-foreground">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span>
                      {group.name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({kids.length})
                      </span>
                    </span>
                  </button>
                  {group.note && <p className="mt-1 text-xs text-muted-foreground">{group.note}</p>}
                  <div className="mt-2 flex items-center gap-1">
                    <NeueKategorieDialog categories={categories} presetParentId={group.id} />
                    <KategorieAktionen kategorie={group} />
                  </div>
                  {isOpen && kids.length > 0 && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      {kids.map((k) => (
                        <div key={k.id} className={cn("pl-3", !k.is_active && "opacity-60")}>
                          <p className="text-sm text-foreground">{k.name}</p>
                          {k.note && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{k.note}</p>
                          )}
                          <div className="mt-1.5">
                            <KategorieAktionen kategorie={k} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {treffer.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title={t("kategorien.keineTreffer")}
                hint={t("kategorien.keineTrefferHint")}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function KategorieAktionen({ kategorie }: { kategorie: BwaCategory }) {
  const { t } = useTranslation();
  const update = useUpdateBwaCategory();
  const remove = useSoftDeleteBwaCategory();
  const [editOpen, setEditOpen] = useState(false);
  // One input box (German — the audience for this admin screen). name_en has no separate entry
  // point here and is simply kept equal to name for a category created or renamed this way; it
  // only carries a real translation for the categories seeded from Appendix A3 (migration 0030).
  const [name, setName] = useState(kategorie.name);
  const [note, setNote] = useState(kategorie.note ?? "");
  const [grund, setGrund] = useState("");

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            {t("kategorien.action.bearbeiten")}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("kategorien.edit.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("kategorien.feld.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("kategorien.feld.notiz")}</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("zuordnungsregeln.action.abbrechen")}
            </Button>
            <Button
              disabled={update.isPending || name.trim() === ""}
              onClick={() =>
                update.mutate(
                  {
                    id: kategorie.id,
                    // name_en deliberately not sent: the ~106 categories seeded from Appendix A3
                    // carry a real English translation, and overwriting it with the German text on
                    // every edit would destroy that. It only ever gets set once, at creation.
                    changes: {
                      name: name.trim(),
                      note: note.trim() === "" ? null : note.trim(),
                    },
                  },
                  {
                    onSuccess: () => {
                      toast.success(t("kategorien.toast.gespeichert"));
                      setEditOpen(false);
                    },
                    onError: (e) =>
                      toast.error(
                        t("zuordnungsregeln.toast.fehlgeschlagen", {
                          error: fehlerText(e),
                        }),
                      ),
                  },
                )
              }
            >
              {t("kategorien.edit.speichern")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("kategorien.loeschen.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("kategorien.loeschen.desc", { name: kategorie.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            placeholder={t("zuordnungsregeln.action.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("zuordnungsregeln.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!grund.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(
                  { id: kategorie.id, grund: grund.trim() },
                  {
                    onSuccess: () => toast.success(t("kategorien.toast.geloescht")),
                    onError: (e) =>
                      toast.error(
                        t("zuordnungsregeln.toast.fehlgeschlagen", {
                          error: fehlerText(e),
                        }),
                      ),
                  },
                )
              }
            >
              {t("zuordnungsregeln.action.loeschenConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Derive a unique storage code from the German name, e.g. "Reisekosten" -> "REISEKOSTEN".
 *
 * The client's specification asks for a category to be creatable by a bookkeeper without a
 * developer, so `code` is no longer typed by hand: it is an internal identifier and asking for it
 * was the main thing making this form look technical. Collisions get a numeric suffix, since
 * `bwa_categories_code_uniq` would otherwise reject the insert.
 */
function codeFromName(name: string, taken: Set<string>): string {
  const base =
    name
      .trim()
      .toUpperCase()
      .replace(/Ä/g, "AE")
      .replace(/Ö/g, "OE")
      .replace(/Ü/g, "UE")
      .replace(/ß/g, "SS")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "KATEGORIE";
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Create a category. Rendered either as the tab's main "Kategorie erstellen" button (top-level),
 * or as the `+` on a parent row, which pre-selects that parent and hides the picker.
 */
function NeueKategorieDialog({
  categories,
  presetParentId,
}: {
  categories: BwaCategory[];
  presetParentId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState(presetParentId ?? LEER);
  // One input box (German). name_en has no separate entry point here — a category created this
  // way simply has no distinct translation, and mirrors the German name into that column.
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<BwaCategory["direction"]>("ausgang");
  const create = useCreateBwaCategory();

  const coarseOptions: ComboboxOption[] = useMemo(
    () =>
      categories
        .filter((c) => !c.parent_id && c.is_active)
        .map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );
  const parent = categories.find((c) => c.id === parentId);
  const takenCodes = useMemo(() => new Set(categories.map((c) => c.code)), [categories]);

  function zuruecksetzen() {
    setParentId(presetParentId ?? LEER);
    setName("");
    setNote("");
    setDirection("ausgang");
  }

  function speichern() {
    // BWA block and line are derived, never asked for. A child inherits its parent's; a new
    // top-level category takes the block its income/cost choice implies. The client's
    // specification has no BWA concept at all, and whether BWA survives at all is still open with
    // them — so the columns stay populated and valid, without a bookkeeper ever seeing them.
    const derivedBlock: BwaCategory["bwa_block"] = direction === "eingang" ? "einnahmen" : "kosten";
    const input: BwaCategoryInput = {
      code: codeFromName(name, takenCodes),
      name: name.trim(),
      name_en: name.trim(),
      parent_id: parentId === LEER ? null : parentId,
      bwa_block: parent ? parent.bwa_block : derivedBlock,
      bwa_line: parent ? parent.bwa_line : codeFromName(name, takenCodes).toLowerCase(),
      direction: parent ? parent.direction : direction,
      note: note.trim() === "" ? null : note.trim(),
    };
    if (!input.name) {
      toast.error(t("kategorien.neu.wertFehlt"));
      return;
    }
    create.mutate(input, {
      onSuccess: () => {
        toast.success(t("kategorien.toast.angelegt"));
        zuruecksetzen();
        setOpen(false);
      },
      onError: (e) => {
        const msg = fehlerText(e);
        toast.error(
          /duplicate key|bwa_categories_code_uniq/i.test(msg)
            ? t("kategorien.neu.codeSchonVorhanden")
            : t("zuordnungsregeln.toast.fehlgeschlagen", { error: msg }),
        );
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {presetParentId ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title={t("kategorien.neu.unterkategorie")}
            aria-label={t("kategorien.neu.unterkategorie")}
          >
            <Plus className="size-4" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="size-4" /> {t("kategorien.neu.button")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {presetParentId ? t("kategorien.neu.unterkategorie") : t("kategorien.neu.title")}
          </DialogTitle>
          <DialogDescription>{t("kategorien.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {presetParentId ? (
            <p className="text-xs text-muted-foreground">
              {t("kategorien.feld.unterVon", { name: parent?.name ?? "" })}
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("kategorien.feld.parent")}</Label>
              <Combobox
                value={parentId === LEER ? null : parentId}
                onValueChange={setParentId}
                options={[
                  { value: LEER, label: t("kategorien.feld.parentKeiner") },
                  ...coarseOptions,
                ]}
              />
            </div>
          )}
          {!presetParentId && parentId === LEER && (
            <div className="space-y-1.5">
              <Label>{t("kategorien.feld.art")}</Label>
              <Combobox
                value={direction}
                onValueChange={(v) => setDirection(v as BwaCategory["direction"])}
                options={[
                  { value: "ausgang", label: t("kategorien.block.kosten") },
                  { value: "eingang", label: t("kategorien.block.einnahmen") },
                ]}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("kategorien.feld.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kategorien.feld.notiz")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("zuordnungsregeln.action.abbrechen")}
          </Button>
          <Button onClick={speichern} disabled={create.isPending}>
            {t("kategorien.neu.speichern")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Kontenrahmen tab — year-keyed category-to-account mapping
// ===========================================================================
