import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type FilterField } from "@/components/data-table/filter-fields";
import { FilterPills } from "@/components/data-table/filter-pills";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { ListToolbar } from "@/components/records/list-toolbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { useDocumentTypes, useSaveDocumentType } from "@/data/document-types";
import type { DocumentType } from "@/data/document-types";
import { errorText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

function documentTypeKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? "" : trimmed.replace(/\s+/g, "_");
}

function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

export const Route = createFileRoute("/document-types/")({
  head: () => ({ meta: [{ title: pageTitle("Document types") }] }),
  staticData: { titleKey: "documentTypes" },
  component: DocumentTypesPage,
});

function DocumentTypesPage() {
  const { t } = useTranslation();
  const q = useDocumentTypes();
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = useMemo(() => {
    return all.filter((r) => {
      if (activeOnly && !r.is_active) return false;
      return matchesQuery(search, [r.code, r.label]);
    });
  }, [all, search, activeOnly]);

  const inactiveTotal = useMemo(() => all.filter((r) => !r.is_active).length, [all]);

  const filterFields: FilterField[] = [
    {
      kind: "toggle",
      key: "active",
      fieldLabel: t("documentTypes.filter.status"),
      label: t("documentTypes.filter.activeOnly", { count: inactiveTotal }),
      value: activeOnly,
      onChange: setActiveOnly,
    },
  ];

  return (
    <div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="shrink-0 text-2xl font-semibold tracking-tight text-foreground">
          {t("documentTypes.title")}
        </h1>
        <ListToolbar
          className="sm:ml-auto"
          value={search}
          onValueChange={setSearch}
          placeholder={t("documentTypes.search")}
          actions={
            <>
              <FilterPopover
                fields={filterFields}
                labels={{
                  button: t("documentTypes.filter.button"),
                  title: t("documentTypes.filter.title"),
                  reset: t("documentTypes.filter.reset"),
                }}
              />
              <TypeDialog all={all} />
            </>
          }
        />
      </div>
      <FilterPills className="mt-3" fields={filterFields} />

      {q.isError ? (
        <div className="mt-6">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading ? (
        <div className="mt-6">
          <TableSkeleton rows={5} cols={5} />
        </div>
      ) : all.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t("documentTypes.empty")} />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t("documentTypes.col.code")}</TableHead>
                <TableHead>{t("documentTypes.col.label")}</TableHead>
                <TableHead>{t("documentTypes.col.mapsFrom")}</TableHead>
                <TableHead className="w-[120px]">{t("documentTypes.col.order")}</TableHead>
                <TableHead className="w-[120px]">{t("documentTypes.col.active")}</TableHead>
                <TableHead className="w-[64px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className={row.is_active ? undefined : "opacity-60"}>
                  <TableCell className="font-mono text-sm text-foreground">{row.code}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {row.label}
                      {row.is_seeded && (
                        <Badge variant="outline" className="text-xs">
                          {t("documentTypes.seeded")}
                        </Badge>
                      )}
                      {row.is_fallback && (
                        <Badge variant="secondary" className="text-xs">
                          {t("documentTypes.fallback")}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {(row.maps_from ?? []).join(", ")}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.sort_order}
                  </TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Badge variant="secondary">{t("documentTypes.active")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("documentTypes.inactive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <TypeDialog row={row} all={all} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function TypeDialog({ row, all }: { row?: DocumentType; all: DocumentType[] }) {
  const { t } = useTranslation();
  const save = useSaveDocumentType();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(row?.code ?? "");
  const [label, setLabel] = useState(row?.label ?? "");
  const [order, setOrder] = useState(String(row?.sort_order ?? 0));
  const [active, setActive] = useState(row?.is_active ?? true);
  const [spellings, setSpellings] = useState<string[]>(row?.maps_from ?? []);
  const [fallback, setFallback] = useState(row?.is_fallback ?? false);

  const otherActive = useMemo(
    () => all.filter((r) => r.is_active && r.id !== row?.id),
    [all, row?.id],
  );
  const currentFallback = useMemo(() => otherActive.find((r) => r.is_fallback), [otherActive]);

  function rejectReason(spelling: string): string | null {
    if (spelling === documentTypeKey(code)) {
      return t("documentTypes.toast.isOwnCode", { word: spelling });
    }
    if (spellings.includes(spelling)) {
      return t("documentTypes.toast.alreadyHere", { word: spelling });
    }
    if (otherActive.some((r) => documentTypeKey(r.code) === spelling)) {
      return t("documentTypes.toast.isOwnType", { word: spelling });
    }
    const other = otherActive.find((r) =>
      (r.maps_from ?? []).some((s) => documentTypeKey(s) === spelling),
    );
    if (other) {
      return t("documentTypes.toast.belongsToOther", { word: spelling, type: other.label });
    }
    return null;
  }

  function handleSave() {
    save.mutate(
      {
        id: row?.id,
        code,
        label,
        sort_order: Number(order) || 0,
        is_active: active,
        maps_from: spellings,
        is_fallback: fallback && active,
      },
      {
        onSuccess: () => {
          toast.success(t("documentTypes.toast.saved"));
          setOpen(false);
        },
        onError: (e) => toast.error(t("documentTypes.toast.failed", { error: errorText(e) })),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setCode(row?.code ?? "");
          setLabel(row?.label ?? "");
          setOrder(String(row?.sort_order ?? 0));
          setActive(row?.is_active ?? true);
          setSpellings(row?.maps_from ?? []);
          setFallback(row?.is_fallback ?? false);
        }
      }}
    >
      <DialogTrigger asChild>
        {row ? (
          <Button variant="ghost" size="icon" aria-label={t("documentTypes.edit")}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="size-4" /> {t("documentTypes.new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-6">
            <DialogTitle>{row ? t("documentTypes.edit") : t("documentTypes.new")}</DialogTitle>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {t("documentTypes.col.active")}
              <Switch
                checked={active}
                onCheckedChange={(next) => {
                  setActive(next);
                  if (!next) setFallback(false);
                }}
              />
            </label>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("documentTypes.col.code")}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("documentTypes.col.label")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("documentTypes.col.order")}</Label>
            <Input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("documentTypes.col.mapsFrom")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("documentTypes.mapsFromHint")}</p>
            <SpellingListField
              spellings={spellings}
              onSpellingsChange={setSpellings}
              rejectReason={rejectReason}
            />
          </div>
          <div className="space-y-1.5 border-t border-border pt-4">
            <label className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">{t("documentTypes.fallback")}</span>
              <Switch checked={fallback} disabled={!active} onCheckedChange={setFallback} />
            </label>
            <p className="text-xs text-muted-foreground">{t("documentTypes.fallbackHint")}</p>
            {!active && (
              <p className="text-xs text-muted-foreground">
                {t("documentTypes.fallbackActiveOnly")}
              </p>
            )}
            {fallback && active && currentFallback && (
              <p className="text-xs text-amber-700">
                {t("documentTypes.fallbackSwitch", { type: currentFallback.label })}
              </p>
            )}
            {row?.is_fallback && !(fallback && active) && (
              <p className="text-xs text-amber-700">{t("documentTypes.fallbackWouldBeMissing")}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("documentTypes.noDelete")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("documentTypes.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={save.isPending || !code.trim() || !label.trim()}>
            {save.isPending ? t("documentTypes.saving") : t("documentTypes.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpellingListField({
  spellings,
  onSpellingsChange,
  rejectReason,
}: {
  spellings: string[];
  onSpellingsChange: (next: string[]) => void;
  rejectReason: (spelling: string) => string | null;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  function add() {
    const spelling = documentTypeKey(draft);
    if (!spelling) return;
    const reason = rejectReason(spelling);
    if (reason) {
      toast.error(reason);
      return;
    }
    onSpellingsChange([...spellings, spelling]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("documentTypes.spellingPlaceholder")}
          className="font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={!draft.trim()}
          onClick={add}
        >
          <Plus className="size-3.5" /> {t("documentTypes.addSpelling")}
        </Button>
      </div>
      <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
        {spellings.map((spelling) => (
          <li
            key={spelling}
            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 font-mono text-xs"
          >
            <span className="min-w-0 truncate text-foreground">{spelling}</span>
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-destructive"
              aria-label={t("documentTypes.removeSpelling")}
              onClick={() => onSpellingsChange(spellings.filter((s) => s !== spelling))}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {spellings.length === 0 && (
          <li className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
            {t("documentTypes.spellingsEmpty")}
          </li>
        )}
      </ul>
    </div>
  );
}
