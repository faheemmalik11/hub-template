import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  ClipboardList,
  Clock,
  Database,
  Download,
  FileCog,
  FileInput,
  FileOutput,
  FileText,
  Files,
  Folder,
  History,
  Inbox,
  Landmark,
  ListChecks,
  ListOrdered,
  Mail,
  ShieldCheck,
  Tags,
  Type,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { NoAccess } from "@/components/layout/no-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EXPORTABLE_TABLES,
  EXPORT_GROUPS,
  exportEverythingAsZip,
  exportTableAsCsv,
  type ExportGroup,
} from "@/lib/data/table-export";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/export/")({
  head: () => ({ meta: [{ title: pageTitle("Data export") }] }),
  staticData: { titleKey: "dataExport" },
  component: ExportGuard,
});

function ExportGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageDataExport)) return <NoAccess variant="page" />;
  return <ExportPage />;
}

const TABLE_ICONS: Record<string, LucideIcon> = {
  invoices: FileInput,
  invoiceFiles: Folder,
  invoiceLineItems: ListOrdered,
  invoiceTax: Tags,
  invoiceHistory: History,
  outgoingInvoices: FileOutput,
  outgoingInvoiceFiles: Files,
  handoverBatches: Landmark,
  processingLog: Clock,
  importedItems: Mail,
  companies: Building2,
  properties: Building2,
  propertyCompanies: ArrowLeftRight,
  suppliers: Users,
  customers: User,
  entityAliases: Type,
  categories: Tags,
  categoryAccountMapping: FileCog,
  handoverRoutes: Landmark,
  approvers: ShieldCheck,
  approvalRules: ClipboardList,
  assignmentRules: ClipboardList,
  ingestExclusions: Inbox,
  openItemWhitelistRules: ListChecks,
  filenameSettings: FileCog,
  receiptChannels: Inbox,
  receiptChannelFolders: Folder,
  bankAccounts: Banknote,
  bankTransactions: ArrowLeftRight,
  documentTransactionMatches: ArrowLeftRight,
  manualBookings: ListOrdered,
  appUsers: Users,
  roles: ShieldCheck,
  permissions: ShieldCheck,
  rolePermissions: ShieldCheck,
  userPermissions: ShieldCheck,
  changeHistory: History,
};

const GROUP_ICONS: Record<ExportGroup, LucideIcon> = {
  documents: FileText,
  masterData: Database,
  rules: ClipboardList,
  bank: Banknote,
  access: ShieldCheck,
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ExportPage() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const [all, setAll] = useState<{ done: number; total: number } | null>(null);

  async function handleExportAll() {
    setAll({ done: 0, total: EXPORTABLE_TABLES.length });
    try {
      const res = await exportEverythingAsZip((done, total) => setAll({ done, total }));
      toast.success(t("dataExport.allSuccess", { tables: res.tables, rows: res.rows }));
    } catch (error) {
      toast.error(t("dataExport.error", { error: errorText(error) }));
    } finally {
      setAll(null);
    }
  }

  async function handleExport(key: string, table: string) {
    setPending(key);
    try {
      const count = await exportTableAsCsv(table);
      toast.success(t("dataExport.success", { count }));
    } catch (error) {
      toast.error(t("dataExport.error", { error: errorText(error) }));
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div data-tour="export-page-header">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("dataExport.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("dataExport.subtitle")}</p>
      </div>

      <Card data-tour="export-page-options" className="mt-6 max-w-5xl p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Download className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-foreground">{t("dataExport.allTitle")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("dataExport.allBody")}</p>
          </div>
          <Button className="shrink-0 gap-1.5" disabled={!!all} onClick={handleExportAll}>
            <Download className="size-4" />
            {all
              ? t("dataExport.allPending", { done: all.done, total: all.total })
              : t("dataExport.allAction")}
          </Button>
        </div>
      </Card>

      {EXPORT_GROUPS.map((group) => {
        const GroupIcon = GROUP_ICONS[group];
        const entries = EXPORTABLE_TABLES.filter((e) => e.group === group);
        return (
          <section key={group} className="mt-8 max-w-5xl">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
              <GroupIcon className="size-4 text-muted-foreground" />
              {t(`dataExport.group.${group}`)}
            </h2>
            <p className="mb-3 ml-6 text-sm text-muted-foreground">
              {t(`dataExport.groupDesc.${group}`)}
            </p>
            <Card className="grid p-0 sm:grid-cols-2">
              {entries.map((entry, index) => {
                const Icon = TABLE_ICONS[entry.key] ?? GroupIcon;
                const inLeftColumn = index % 2 === 0;
                const isLastOfColumn = index >= entries.length - (entries.length % 2 === 0 ? 2 : 1);
                return (
                  <div
                    key={entry.key}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      isLastOfColumn ? "" : "border-b border-border"
                    } ${inLeftColumn ? "sm:border-r sm:border-border" : ""}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {t(`dataExport.table.${entry.labelKey}`)}
                      </p>
                      <p className="text-xs leading-snug text-muted-foreground">
                        {t(`dataExport.desc.${entry.labelKey}`)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={pending === entry.key}
                      onClick={() => handleExport(entry.key, entry.table)}
                    >
                      <Download className="size-3.5" />
                      {pending === entry.key ? t("dataExport.exporting") : t("dataExport.button")}
                    </Button>
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
