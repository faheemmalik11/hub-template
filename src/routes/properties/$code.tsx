import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { AssignmentDialog } from "@/components/properties/assignment-dialog";
import { KnownSpellingsCard } from "@/components/master-data/known-spellings-card";
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
import { PropertyDetail } from "@/features/properties";
import type { PropertyData, PropertiesConfig } from "@/features/properties";
import { useCompanies, usePropertyCompanies, useRemovePropertyCompanyLink } from "@/data";
import type { PropertyCompany } from "@/lib/data/types";
import { CompanyChip } from "@/components/documents/badges";
import { errorText } from "@/lib/data/format";
import { useAuth } from "@/lib/auth";
import { pageTitle } from "@/config/brand";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/properties/$code")({
  head: () => ({ meta: [{ title: pageTitle("Objekt") }] }),
  component: PropertyDetailPage,
});

/**
 * The this client wiring for the shared Objekt detail screen.
 *
 * The assignment card is EDITABLE here, unlike Immonetz where the Geschäftsbereiche screen owns the
 * relation. this client assigns a property straight to companies, and this page is the only place that
 * does it, so editing it where it is displayed is the whole of the feature rather than half of it.
 */
function PropertyDetailPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  // Held here rather than in the editor: the Add button sits in the card header, which the shared
  // screen renders, and the Edit buttons sit in the rows, so both open one modal through this.
  const [assignmentDialog, setAssignmentDialog] = useState<{ link: PropertyCompany | null } | null>(
    null,
  );
  const config = useMemo<PropertiesConfig>(
    () => ({
      openProperty: (c) => navigate({ to: "/properties/$code", params: { code: c } }),
      openList: () => navigate({ to: "/properties" }),
      openDocument: (id) => navigate({ to: "/incoming-invoices/$nr", params: { nr: id } }),
      openNew: (c) => navigate({ to: "/properties", search: { new: c } }),
      discardNewParam: () => navigate({ to: "/properties", search: {}, replace: true }),
      openCompany: (id) => navigate({ to: "/companies/$id", params: { id } }),
      // Archiving is supported; the review date and the ownership type are not columns here, and
      // filing_folder is a Dropbox path for the pipeline rather than a link anybody opens. See
      // the capability table in features/properties/PORTING.md.
      masterDataCheck: false,
      archiving: true,
      ownership: false,
      driveFolder: false,
      assignmentEditor: (property) => (
        <AssignmentEditor
          property={property}
          dialog={assignmentDialog}
          setDialog={setAssignmentDialog}
        />
      ),
      assignmentAction: () => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setAssignmentDialog({ link: null })}
        >
          <Plus className="size-3.5" /> {t("properties.detail.zuordnungHinzufuegen")}
        </Button>
      ),
      spellings: (propertyCode) => (
        <KnownSpellingsCard entityType="objekt" entityCode={propertyCode} />
      ),
      backLink: ({ className, children }) => (
        <Link to="/properties" className={className}>
          {children}
        </Link>
      ),
    }),
    [navigate, t, assignmentDialog],
  );

  return <PropertyDetail code={code} config={config} />;
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
function AssignmentEditor({
  property,
  dialog,
  setDialog,
}: {
  property: PropertyData;
  dialog: { link: PropertyCompany | null } | null;
  setDialog: (dialog: { link: PropertyCompany | null } | null) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const linksQ = usePropertyCompanies();
  const companiesQ = useCompanies();
  const { user } = useAuth();
  const remove = useRemovePropertyCompanyLink();
  const [zuRemove, setZuRemove] = useState<{
    link: PropertyCompany;
    company: string;
  } | null>(null);

  const rows = useMemo(() => {
    const byId = new Map((companiesQ.data ?? []).map((g) => [g.id, g]));
    return (linksQ.data ?? [])
      .filter((l) => l.property_id === property.id)
      .map((link) => ({ link, company: byId.get(link.company_id) ?? null }))
      .sort((a, b) => (a.company?.code ?? "").localeCompare(b.company?.code ?? ""));
  }, [linksQ.data, companiesQ.data, property.id]);

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
          {t("properties.detail.gesellschaftenEmpty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(({ link, company }) => (
            <div
              key={link.id}
              className="group flex w-full flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
            >
              {company ? (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/companies/$id", params: { id: company.id } })}
                  className="inline-flex cursor-pointer items-center gap-2 text-left hover:underline"
                >
                  <CompanyChip code={company.code} />
                  <span className="text-xs text-muted-foreground">{company.name}</span>
                </button>
              ) : (
                <CompanyChip code={null} />
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
                    ? t("properties.detail.kostenstelle", { nr: link.cost_centre_number })
                    : t("properties.detail.kostenstelleFehlt")}
                </span>
                {/* Edit and remove appear on hover (and on keyboard focus), always on a phone where
                    there is no hover, the same way the company page's property list works. */}
                <div className="flex items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setDialog({ link })}
                    aria-label={t("properties.detail.zuordnungBearbeiten")}
                    title={t("properties.detail.zuordnungBearbeiten")}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setZuRemove({
                        link,
                        company: company ? `${company.code} · ${company.name}` : "",
                      })
                    }
                    aria-label={t("properties.detail.zuordnungEntfernen")}
                    title={t("properties.detail.zuordnungEntfernen")}
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
        <AssignmentDialog
          fest={{ art: "objekt", propertyId: property.id }}
          link={dialog.link}
          assign={rows.map((z) => z.link.company_id)}
          onClose={() => setDialog(null)}
        />
      )}
      <AlertDialog
        open={!!zuRemove}
        onOpenChange={(open) => (open ? undefined : setZuRemove(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("properties.detail.zuordnungEntfernenTitel")}</AlertDialogTitle>
            <AlertDialogDescription>
              {rows.length <= 1
                ? t("properties.detail.zuordnungLetzte")
                : t("properties.detail.zuordnungEntfernenBeschreibung", {
                    company: zuRemove?.company ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("properties.detail.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!zuRemove || rows.length <= 1 || remove.isPending}
              onClick={() => {
                if (!zuRemove) return;
                remove.mutate(
                  { linkId: zuRemove.link.id, actor: user?.email ?? null },
                  {
                    onSuccess: () => {
                      toast.success(t("properties.detail.toast.zuordnungGeaendert"));
                      setZuRemove(null);
                    },
                    onError: (e) =>
                      toast.error(
                        t("properties.detail.toast.speichernFehlgeschlagen", {
                          error: errorText(e),
                        }),
                      ),
                  },
                );
              }}
            >
              {t("properties.detail.zuordnungEntfernenBestaetigen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
