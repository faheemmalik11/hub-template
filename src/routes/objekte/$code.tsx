import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ZuordnungDialog } from "@/components/objekte/zuordnung-dialog";
import { KnownSpellingsCard } from "@/components/stammdaten/known-spellings-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ObjektDetail } from "@/features/properties";
import type { ObjektDaten, PropertiesConfig } from "@/features/properties";
import { useGesellschaften, usePropertyCompanies, useRemovePropertyCompanyLink } from "@/data";
import type { PropertyCompany } from "@/lib/data/types";
import { GesellschaftChip } from "@/components/belege/badges";
import { fehlerText } from "@/lib/data/format";
import { useAuth } from "@/lib/auth";
import { pageTitle } from "@/config/brand";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/objekte/$code")({
  head: () => ({ meta: [{ title: pageTitle("Objekt") }] }),
  component: ObjektDetailPage,
});

/**
 * The this client wiring for the shared Objekt detail screen.
 *
 * The assignment card is EDITABLE here, unlike Immonetz where the Geschäftsbereiche screen owns the
 * relation. this client assigns a property straight to companies, and this page is the only place that
 * does it, so editing it where it is displayed is the whole of the feature rather than half of it.
 */
function ObjektDetailPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  // Held here rather than in the editor: the Add button sits in the card header, which the shared
  // screen renders, and the Edit buttons sit in the rows, so both open one modal through this.
  const [zuordnungDialog, setZuordnungDialog] = useState<{ link: PropertyCompany | null } | null>(
    null,
  );
  const config = useMemo<PropertiesConfig>(
    () => ({
      oeffneObjekt: (c) => navigate({ to: "/objekte/$code", params: { code: c } }),
      oeffneListe: () => navigate({ to: "/objekte" }),
      oeffneBeleg: (id) => navigate({ to: "/eingangsrechnungen/$nr", params: { nr: id } }),
      oeffneNeu: (c) => navigate({ to: "/objekte", search: { neu: c } }),
      verwerfeNeuParam: () => navigate({ to: "/objekte", search: {}, replace: true }),
      oeffneGesellschaft: (id) => navigate({ to: "/gesellschaften/$id", params: { id } }),
      // Archiving is supported; the review date and the ownership type are not columns here, and
      // filing_folder is a Dropbox path for the pipeline rather than a link anybody opens. See
      // the capability table in features/properties/PORTING.md.
      stammdatenPruefung: false,
      archivierung: true,
      eigentum: false,
      driveOrdner: false,
      zuordnungEditor: (objekt) => (
        <ZuordnungEditor objekt={objekt} dialog={zuordnungDialog} setDialog={setZuordnungDialog} />
      ),
      zuordnungAktion: () => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setZuordnungDialog({ link: null })}
        >
          <Plus className="size-3.5" /> {t("objekte.detail.zuordnungHinzufuegen")}
        </Button>
      ),
      schreibweisen: (objektCode) => (
        <KnownSpellingsCard entityType="objekt" entityCode={objektCode} />
      ),
      zurueckLink: ({ className, children }) => (
        <Link to="/objekte" className={className}>
          {children}
        </Link>
      ),
    }),
    [navigate, t, zuordnungDialog],
  );

  return <ObjektDetail code={code} config={config} />;
}

/**
 * The property's companies, each with the cost-centre number it carries in that company's books.
 *
 * One modal for adding a company and for changing an assignment (17.09.2026): pick the company and
 * its number together, since the number only means something within a company. The rows show the
 * number or say it is missing. The number is admin-only, here and in the database (migrations
 * 20260917140000 and 20260917150000), because a wrong number goes straight to the tax adviser;
 * anyone who may edit the property may still assign companies, as before.
 */
function ZuordnungEditor({
  objekt,
  dialog,
  setDialog,
}: {
  objekt: ObjektDaten;
  dialog: { link: PropertyCompany | null } | null;
  setDialog: (dialog: { link: PropertyCompany | null } | null) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const linksQ = usePropertyCompanies();
  const gesellschaftenQ = useGesellschaften();
  const { user } = useAuth();
  const entfernen = useRemovePropertyCompanyLink();
  const [zuEntfernen, setZuEntfernen] = useState<{
    link: PropertyCompany;
    gesellschaft: string;
  } | null>(null);

  const zeilen = useMemo(() => {
    const byId = new Map((gesellschaftenQ.data ?? []).map((g) => [g.id, g]));
    return (linksQ.data ?? [])
      .filter((l) => l.property_id === objekt.id)
      .map((link) => ({ link, gesellschaft: byId.get(link.company_id) ?? null }))
      .sort((a, b) => (a.gesellschaft?.code ?? "").localeCompare(b.gesellschaft?.code ?? ""));
  }, [linksQ.data, gesellschaftenQ.data, objekt.id]);

  return (
    <div className="space-y-3">
      {zeilen.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
          {t("objekte.detail.gesellschaftenEmpty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {zeilen.map(({ link, gesellschaft }) => (
            <div
              key={link.id}
              className="group flex w-full flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
            >
              {gesellschaft ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate({ to: "/gesellschaften/$id", params: { id: gesellschaft.id } })
                  }
                  className="inline-flex cursor-pointer items-center gap-2 text-left hover:underline"
                >
                  <GesellschaftChip code={gesellschaft.code} />
                  <span className="text-xs text-muted-foreground">{gesellschaft.name}</span>
                </button>
              ) : (
                <GesellschaftChip code={null} />
              )}
              <div className="ml-auto flex items-center gap-1">
                <span
                  className={
                    link.cost_centre_number != null
                      ? "text-xs text-muted-foreground"
                      : "text-xs text-warning"
                  }
                >
                  {link.cost_centre_number != null
                    ? t("objekte.detail.kostenstelle", { nr: link.cost_centre_number })
                    : t("objekte.detail.kostenstelleFehlt")}
                </span>
                {/* Edit and remove appear on hover (and on keyboard focus), always on a phone where
                    there is no hover, the same way the company page's property list works. */}
                <div className="flex items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setDialog({ link })}
                    aria-label={t("objekte.detail.zuordnungBearbeiten")}
                    title={t("objekte.detail.zuordnungBearbeiten")}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setZuEntfernen({
                        link,
                        gesellschaft: gesellschaft
                          ? `${gesellschaft.code} · ${gesellschaft.name}`
                          : "",
                      })
                    }
                    aria-label={t("objekte.detail.zuordnungEntfernen")}
                    title={t("objekte.detail.zuordnungEntfernen")}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog && (
        <ZuordnungDialog
          fest={{ art: "objekt", propertyId: objekt.id }}
          link={dialog.link}
          vergeben={zeilen.map((z) => z.link.company_id)}
          onClose={() => setDialog(null)}
        />
      )}
      <AlertDialog
        open={!!zuEntfernen}
        onOpenChange={(offen) => (offen ? undefined : setZuEntfernen(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("objekte.detail.zuordnungEntfernenTitel")}</AlertDialogTitle>
            <AlertDialogDescription>
              {zeilen.length <= 1
                ? t("objekte.detail.zuordnungLetzte")
                : t("objekte.detail.zuordnungEntfernenBeschreibung", {
                    gesellschaft: zuEntfernen?.gesellschaft ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("objekte.detail.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!zuEntfernen || zeilen.length <= 1 || entfernen.isPending}
              onClick={() => {
                if (!zuEntfernen) return;
                entfernen.mutate(
                  { linkId: zuEntfernen.link.id, actor: user?.email ?? null },
                  {
                    onSuccess: () => {
                      toast.success(t("objekte.detail.toast.zuordnungGeaendert"));
                      setZuEntfernen(null);
                    },
                    onError: (e) =>
                      toast.error(
                        t("objekte.detail.toast.speichernFehlgeschlagen", { error: fehlerText(e) }),
                      ),
                  },
                );
              }}
            >
              {t("objekte.detail.zuordnungEntfernenBestaetigen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
