import { useEffect, useState } from "react";

import {
  Button,
  DATEV_DIRECTIONS,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  errorText,
  toast,
  useSaveDatevRoutes,
  useTranslation,
  type DatevDirection,
  type DatevRoute,
} from "./adapter";
import type { CompanyRow } from "./model";

type Draft = Record<DatevDirection, { address: string; isEnabled: boolean }>;

/**
 * Where a company's DATEV destination is set, and the ONLY place an address is ever typed.
 *
 * The table deliberately reports setup and nothing else, so this drawer is the whole of the
 * address's presence in the UI. It is opened on purpose, by somebody who came to change a
 * destination.
 *
 * THE ADDRESS FIELD CANNOT BE PREFILLED, and that is not a gap to close. `datev_routes.address` is
 * a blind write enforced in Postgres, not in this app: `authenticated` holds SELECT on every column
 * of that table EXCEPT `address`, and has no direct INSERT/UPDATE at all — every write goes through
 * a SECURITY DEFINER RPC precisely so no grant ever has to include the column (migration 0038). An
 * admin can set or replace an address; nobody can read one back, including their own a second after
 * saving it. So the field opens empty with "•••• hinterlegt" as its placeholder and a line saying
 * what blank means, rather than pretending to show a value it is not allowed to fetch.
 *
 * The consequence that matters most: BLANK MEANS "LEAVE IT ALONE", never "clear it".
 * `useSaveDatevRoutes` enforces that — it writes an address only for a direction actually typed
 * into, and routes a change of switch alone through the status-only RPC.
 */
export function SetupDrawer({
  row,
  open,
  onOpenChange,
}: {
  row: CompanyRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const saveRoutes = useSaveDatevRoutes();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft({}));

  const routes = (row?.routes ?? {}) as Record<DatevDirection, DatevRoute | undefined>;

  // Resync on every open: the drawer is mounted once by the page and outlives any single company,
  // so without this it would open on the previous company's switches.
  useEffect(() => {
    if (open) {
      setDraft(emptyDraft(routes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.company.id]);

  if (!row) return null;

  const setUp = row.setup !== "missing";

  // Nothing to save when no address was typed and no existing row's switch moved. Checked so Save
  // cannot fire a round of no-op RPCs and report success.
  const nothingZuSave = DATEV_DIRECTIONS.every((d) => {
    const existing = routes[d];
    const entry = draft[d];
    if (entry.address.trim()) return false;
    if (!existing) return true;
    return entry.isEnabled === existing.is_enabled;
  });

  function patch(d: DatevDirection, changes: Partial<Draft[DatevDirection]>) {
    setDraft((prev) => ({ ...prev, [d]: { ...prev[d], ...changes } }));
  }

  function save() {
    saveRoutes.mutate(
      {
        company_id: row!.company.id,
        entries: DATEV_DIRECTIONS.map((d) => ({
          direction: d,
          address: draft[d].address.trim() || undefined,
          is_enabled: draft[d].isEnabled,
          // The note is carried through untouched. It is stored per direction and nothing on this
          // screen edits it any more, but `set_datev_route` always writes the column — passing the
          // current value is what stops saving an address from silently wiping a note somebody left
          // on that route.
          note: routes[d]?.note ?? null,
          existingId: routes[d]?.id,
        })),
      },
      {
        onSuccess: () => {
          toast.success(t("handover.setup.gespeichert"));
          onOpenChange(false);
        },
        onError: (e: unknown) =>
          toast.error(t("handover.setup.fehlgeschlagen", { error: errorText(e) })),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {setUp ? t("handover.setup.titleEdit") : t("handover.setup.title")}
          </SheetTitle>
          <SheetDescription>{t("handover.setup.desc")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-6">
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("handover.setup.gesellschaft")}
            </Label>
            <p className="mt-1 font-medium text-foreground">
              {row.company.code}
              {row.company.name && (
                <span className="ml-1.5 font-normal text-muted-foreground">{row.company.name}</span>
              )}
            </p>
          </div>

          {/* THREE ADDRESSES, AS PEERS. DATEV issues a separate @uploadmail.datev.de address per
              document category and the address IS the routing decision — mail an outgoing invoice
              to the incoming address and it is filed under the wrong category with nothing to tell
              you. So all three are entered the same way, each with its own switch — none is hidden
              or folded away, because an address already on file stays on file and burying a field
              would quietly strand configuration somebody deliberately entered. */}
          <div className="space-y-3">
            {DATEV_DIRECTIONS.map((d) => (
              <AddressField
                key={d}
                direction={d}
                companyId={row.company.id}
                draft={draft[d]}
                existing={routes[d]}
                onChange={(changes) => patch(d, changes)}
              />
            ))}
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveRoutes.isPending}
          >
            {t("handover.aktion.abbrechen")}
          </Button>
          <Button onClick={save} disabled={nothingZuSave || saveRoutes.isPending}>
            {t("handover.setup.speichern")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One direction: its label, its address, its own Active switch.
 *
 * The same markup for all three, so nothing about the layout suggests one of them is the real one
 * and the other two are an afterthought. The only difference on screen is the "noch nicht aktiv"
 * mark, which is a fact about this Hub's send paths rather than about the address.
 */
function AddressField({
  direction,
  companyId,
  draft,
  existing,
  onChange,
}: {
  direction: DatevDirection;
  companyId: string;
  draft: Draft[DatevDirection];
  existing: DatevRoute | undefined;
  onChange: (changes: Partial<Draft[DatevDirection]>) => void;
}) {
  const { t } = useTranslation();
  const fieldId = `datev-${companyId}-${direction}`;
  const switchId = `${fieldId}-aktiv`;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={fieldId} className="text-sm font-medium text-foreground">
          {t(`handover.setup.adresseFuer.${direction}`)}
        </Label>
        {/* Per address, not per company: the send checks `is_enabled` on the row it is about to
            use, so one company can have a live incoming address and a paused outgoing one. */}
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={draft.isEnabled}
            onCheckedChange={(v) => onChange({ isEnabled: v })}
          />
          <Label htmlFor={switchId} className="text-xs font-normal text-muted-foreground">
            {t("handover.setup.aktivKurz")}
          </Label>
        </div>
      </div>
      <Input
        id={fieldId}
        type="email"
        className="mt-2"
        value={draft.address}
        onChange={(e) => onChange({ address: e.target.value })}
        placeholder={existing ? t("handover.setup.adresseVorhanden") : "name@uploadmail.datev.de"}
      />
      {/* One line, under the address that actually sends. The "•••• hinterlegt" placeholder is what
          says an address is already on file — and, by standing in the field rather than beside it,
          what says leaving the field alone leaves the stored address alone. */}
      {direction === "incoming" && (
        <p className="mt-1.5 text-xs text-muted-foreground">{t("handover.setup.adresseHilfe")}</p>
      )}
    </div>
  );
}

/** Switches seeded from what is stored; addresses always blank (see the component's note). */
function emptyDraft(routes: Partial<Record<DatevDirection, DatevRoute | undefined>>): Draft {
  return Object.fromEntries(
    DATEV_DIRECTIONS.map((d) => [d, { address: "", isEnabled: routes[d]?.is_enabled ?? true }]),
  ) as Draft;
}
