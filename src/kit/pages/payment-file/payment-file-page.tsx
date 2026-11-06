import { useEffect, useState } from "react";

import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { Input } from "../../ui/input";
import { Skeleton } from "../../ui/skeleton";
import type { PaymentFileAdapter } from "../../adapters/payment-file";
import {
  AccountPicker,
  DraftSummaryCard,
  PayableDocumentsTable,
  PaymentAccountsDialog,
  PaymentFileHistoryTable,
  PendingPaymentsTable,
  ReviewTable,
  StepNav,
  useDocumentSelection,
  usePaymentFileView,
} from "../../widgets/payment-file";
import type { PaymentFileLabels } from "./labels";
import { englishPaymentFileLabels } from "./labels";

const DEFAULT_PAGE_SIZE = 25;

export interface PaymentFilePageProps {
  adapter: PaymentFileAdapter;
  labels?: PaymentFileLabels;
}

export function PaymentFilePage({
  adapter,
  labels = englishPaymentFileLabels,
}: PaymentFilePageProps) {
  const view = usePaymentFileView(DEFAULT_PAGE_SIZE);
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);

  const accountsQuery = adapter.useAccounts();
  const accounts = accountsQuery.data;

  useEffect(() => {
    if (view.accountId && accounts.some((one) => one.id === view.accountId)) return;
    view.setAccountId(accounts.find((one) => one.isDefault)?.id ?? accounts[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map((one) => one.id).join(",")]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{labels.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.description}</p>
        <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
          {labels.manualUploadNotice}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <StepNav step={view.step} onStepChange={view.setStep} labels={labels} />
        <Button variant="outline" onClick={() => setAccountsDialogOpen(true)}>
          {labels.manageAccounts}
        </Button>
      </div>

      {view.step === "prepare" && (
        <PrepareStep
          adapter={adapter}
          labels={labels}
          view={view}
          accounts={accounts}
          accountsLoading={accountsQuery.loading}
          onOpenAccounts={() => setAccountsDialogOpen(true)}
          onFileCreated={(fileId) => {
            view.setFileId(fileId);
            view.setStep("review");
          }}
        />
      )}
      {view.step === "review" && (
        <ReviewStep
          adapter={adapter}
          labels={labels}
          fileId={view.fileId}
          onGoToPrepare={() => view.setStep("prepare")}
        />
      )}
      {view.step === "track" && <TrackStep adapter={adapter} labels={labels} />}

      <PaymentFileHistory
        adapter={adapter}
        labels={labels}
        onSelectFile={(fileId) => {
          view.setFileId(fileId);
          view.setStep("review");
        }}
      />

      <PaymentAccountsDialog
        adapter={adapter}
        accounts={accounts}
        loading={accountsQuery.loading}
        open={accountsDialogOpen}
        onOpenChange={setAccountsDialogOpen}
        labels={labels}
      />
    </div>
  );
}

function PrepareStep({
  adapter,
  labels,
  view,
  accounts,
  accountsLoading,
  onOpenAccounts,
  onFileCreated,
}: {
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
  view: ReturnType<typeof usePaymentFileView>;
  accounts: ReturnType<PaymentFileAdapter["useAccounts"]>["data"];
  accountsLoading: boolean;
  onOpenAccounts: () => void;
  onFileCreated: (fileId: string) => void;
}) {
  const selection = useDocumentSelection();
  const payableQuery = adapter.usePayableDocuments(view.search, view.page, view.pageSize);

  const rows = payableQuery.data.rows;
  const total = payableQuery.data.total;
  const totalPages = Math.max(1, Math.ceil(total / view.pageSize));
  const from = total === 0 ? 0 : (view.page - 1) * view.pageSize + 1;
  const to = Math.min(view.page * view.pageSize, total);

  if (payableQuery.loading) return <PrepareStepSkeleton />;
  if (payableQuery.error)
    return <ErrorState error={payableQuery.error} onRetry={payableQuery.refetch} />;

  const selectedList = Array.from(selection.selected.values());
  const invoiceTotal = selectedList.reduce((sum, one) => sum + (one.amountGross ?? 0), 0);
  const paymentTotal = selectedList.reduce((sum, one) => sum + one.amountDueNow, 0);
  const discountTotal = invoiceTotal - paymentTotal;
  const disabled = accounts.length === 0 || selectedList.length === 0 || adapter.busy.creatingFile;

  function handleBuild() {
    if (!view.accountId) return;
    void adapter
      .createFile(
        selectedList.map((one) => one.id),
        view.accountId,
      )
      .then((fileId) => {
        selection.clear();
        onFileCreated(fileId);
      });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>{labels.prepare.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{labels.prepare.description}</p>
        </CardHeader>
        <CardContent>
          <AccountPicker
            accounts={accounts}
            loading={accountsLoading}
            accountId={view.accountId}
            onAccountChange={view.setAccountId}
            onManageAccounts={onOpenAccounts}
            labels={labels}
          />
          <Input
            value={view.searchInput}
            onChange={(e) => view.setSearchInput(e.target.value)}
            placeholder={labels.prepare.searchPlaceholder}
            className="mb-4 max-w-sm"
          />
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {view.search ? labels.prepare.noResults : labels.prepare.empty}
            </p>
          ) : (
            <>
              <PayableDocumentsTable
                rows={rows}
                selection={selection}
                adapter={adapter}
                labels={labels}
              />
              <div className="mt-3 border-t border-border pt-3">
                <TablePagination
                  page={view.page}
                  totalPages={totalPages}
                  pageSize={view.pageSize}
                  total={total}
                  from={from}
                  to={to}
                  onPage={view.setPage}
                  onPageSize={view.setPageSize}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <DraftSummaryCard
        selectedCount={selectedList.length}
        totalAvailable={total}
        invoiceTotalText={adapter.formatMoney(invoiceTotal)}
        discountTotalText={
          discountTotal > 0 ? `-${adapter.formatMoney(discountTotal)}` : adapter.formatMoney(0)
        }
        paymentTotalText={adapter.formatMoney(paymentTotal)}
        hasAccounts={accounts.length > 0}
        onManageAccounts={onOpenAccounts}
        disabled={disabled}
        pending={adapter.busy.creatingFile}
        onBuild={handleBuild}
        labels={labels}
      />
    </div>
  );
}

function PrepareStepSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={5} columns={6} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function StepSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <TableSkeleton rows={4} columns={5} />
      </CardContent>
    </Card>
  );
}

function ReviewStep({
  adapter,
  labels,
  fileId,
  onGoToPrepare,
}: {
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
  fileId: string | undefined;
  onGoToPrepare: () => void;
}) {
  const fileQuery = adapter.useFile(fileId);

  if (!fileId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {labels.review.none}
          <div className="mt-3">
            <Button variant="outline" onClick={onGoToPrepare}>
              {labels.review.goToPrepare}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (fileQuery.loading) return <StepSkeleton />;
  if (fileQuery.error || !fileQuery.data) {
    return <ErrorState error={fileQuery.error} onRetry={fileQuery.refetch} />;
  }

  const { file, items } = fileQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.review.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ReviewTable
          file={file}
          items={items}
          adapter={adapter}
          labels={labels}
          downloading={adapter.busy.downloading}
          onDownload={() => {
            void adapter.generateAndDownloadFile(fileId).then((files) => {
              for (const one of files) adapter.downloadFile(one.fileName, one.content);
            });
          }}
          onDiscard={() => void adapter.discardFile(fileId)}
        />
      </CardContent>
    </Card>
  );
}

function TrackStep({
  adapter,
  labels,
}: {
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
}) {
  const pendingQuery = adapter.usePendingPayments();

  if (pendingQuery.loading) return <StepSkeleton />;
  if (pendingQuery.error)
    return <ErrorState error={pendingQuery.error} onRetry={pendingQuery.refetch} />;

  const rows = pendingQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.track.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.track.empty}</p>
        ) : (
          <PendingPaymentsTable rows={rows} adapter={adapter} labels={labels} />
        )}
      </CardContent>
    </Card>
  );
}

function PaymentFileHistory({
  adapter,
  labels,
  onSelectFile,
}: {
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
  onSelectFile: (fileId: string) => void;
}) {
  const filesQuery = adapter.useFiles();

  if (filesQuery.loading) return <StepSkeleton />;
  if (filesQuery.error) return <ErrorState error={filesQuery.error} onRetry={filesQuery.refetch} />;

  const rows = filesQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.history.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.history.empty}</p>
        ) : (
          <PaymentFileHistoryTable
            rows={rows}
            adapter={adapter}
            labels={labels}
            onSelect={onSelectFile}
          />
        )}
      </CardContent>
    </Card>
  );
}
