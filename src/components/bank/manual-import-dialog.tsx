import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  ImportManualTransactionsResult,
  ManualBankAccountRow,
} from "@/lib/api/bank-manual-import.functions";
import type { AiExtractedRow } from "@/lib/api/bank-statement-ai.functions";
import { normalizeTable } from "@/lib/bank-import/normalize";
import type {
  ColumnMapping,
  NormalizedRow,
  NormalizeResult,
  ParsedTable,
} from "@/lib/bank-import/types";
import { useManualBankImport } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ManualImportAccountStep } from "./manual-import-account-step";
import { ManualImportAiPreviewStep } from "./manual-import-ai-preview-step";
import { ManualImportMappingStep } from "./manual-import-mapping-step";
import { ManualImportPreviewStep } from "./manual-import-preview-step";
import { ManualImportResultStep } from "./manual-import-result";
import { ManualImportUploadStep } from "./manual-import-upload-step";
import { errorText } from "@/lib/data/format";

type Step = "account" | "upload" | "mapping" | "preview" | "result";
const STEPS: Step[] = ["account", "upload", "mapping", "preview", "result"];

/**
 * The third bank_transactions inflow (communication thread 4, migration 0071/0082): CSV/XLSX/PDF
 * upload for accounts BANKSapi cannot reach. CSV/XLSX parsing happens entirely client-side
 * (src/lib/bank-import/) and lands on the read-only preview. PDF goes through AI extraction on
 * the server instead (needs OPENAI_API_KEY), skips the mapping step (the model returns fields
 * directly), and lands on a SEPARATE, editable preview (manual-import-ai-preview-step.tsx) since
 * the model can genuinely fail to find a required field and the human has to fill it in before
 * import is even allowed. Either way the wizard only ever sends fully-formed NormalizedRow[] to
 * bank-manual-import.functions.ts.
 */
export function ManualImportDialog() {
  const { t } = useTranslation();
  const importMutation = useManualBankImport();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState<ManualBankAccountRow | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [filename, setFilename] = useState("");
  const [normalized, setNormalized] = useState<NormalizeResult | null>(null);
  // Set only when the rows came from the AI/PDF path — drives which preview component renders
  // and where "back" returns to (there is no mapping step to go back to for a PDF upload).
  const [aiExtraction, setAiExtraction] = useState<{
    rows: AiExtractedRow[];
    notes: string[];
  } | null>(null);
  const [result, setResult] = useState<ImportManualTransactionsResult | null>(null);

  function reset() {
    setStep("account");
    setAccount(null);
    setTable(null);
    setFilename("");
    setNormalized(null);
    setAiExtraction(null);
    setResult(null);
  }

  function handleImport(rows: NormalizedRow[]) {
    if (!account) return;
    importMutation.mutate(
      { accountId: account.id, filename, rows },
      {
        onSuccess: (res) => {
          setResult(res);
          setStep("result");
        },
        onError: (e) => {
          toast.error(
            t("bank.manualImport.errors.importFailed", {
              error: errorText(e),
            }),
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="size-4" />
          {t("bank.manualImport.button")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("bank.manualImport.dialog.title")}</DialogTitle>
          <DialogDescription>{t("bank.manualImport.dialog.description")}</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={cn("flex items-center gap-1", s === step && "font-medium text-foreground")}
            >
              <span>{i + 1}.</span>
              {t(`bank.manualImport.step.${s}`)}
            </li>
          ))}
        </ol>

        {step === "account" && (
          <ManualImportAccountStep
            onSelect={(a) => {
              setAccount(a);
              setStep("upload");
            }}
          />
        )}

        {step === "upload" && (
          <ManualImportUploadStep
            onParsed={(t, name) => {
              setTable(t);
              setFilename(name);
              setStep("mapping");
            }}
            onAiExtracted={(rows, notes, name) => {
              setFilename(name);
              setAiExtraction({ rows, notes });
              setStep("preview");
            }}
          />
        )}

        {step === "mapping" && table && (
          <ManualImportMappingStep
            table={table}
            onConfirm={(mapping: ColumnMapping) => {
              setNormalized(normalizeTable(table, mapping));
              setStep("preview");
            }}
          />
        )}

        {step === "preview" && aiExtraction && (
          <ManualImportAiPreviewStep
            rows={aiExtraction.rows}
            notes={aiExtraction.notes}
            importing={importMutation.isPending}
            onBack={() => setStep("upload")}
            onImport={handleImport}
          />
        )}

        {step === "preview" && !aiExtraction && normalized && (
          <ManualImportPreviewStep
            result={normalized}
            importing={importMutation.isPending}
            onBack={() => setStep("mapping")}
            onImport={handleImport}
          />
        )}

        {step === "result" && result && (
          <ManualImportResultStep result={result} onClose={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
