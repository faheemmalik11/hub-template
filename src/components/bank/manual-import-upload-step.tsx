import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  extractBankStatementFromPdf,
  type AiExtractedRow,
} from "@/lib/api/bank-statement-ai.functions";
import { detectFormat, parseBankFile } from "@/lib/bank-import/parse-file";
import { fileToBase64 } from "@/lib/bank-import/file-to-base64";
import type { ParsedTable } from "@/lib/bank-import/types";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fehlerText } from "@/lib/data/format";

export function ManualImportUploadStep({
  onParsed,
  onAiExtracted,
}: {
  onParsed: (table: ParsedTable, filename: string) => void;
  onAiExtracted: (rows: AiExtractedRow[], notes: string[], filename: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "parsing" | "ai">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (detectFormat(file) === "pdf") {
      setStatus("ai");
      try {
        const pdfBase64 = await fileToBase64(file);
        const result = await extractBankStatementFromPdf({
          data: { filename: file.name, pdfBase64 },
        });
        onAiExtracted(result.rows, result.statementNotes, file.name);
      } catch (e) {
        setError(fehlerText(e));
      } finally {
        setStatus("idle");
      }
      return;
    }

    setStatus("parsing");
    try {
      const { table } = await parseBankFile(file);
      onParsed(table, file.name);
    } catch (e) {
      setError(fehlerText(e));
    } finally {
      setStatus("idle");
    }
  }

  const busy = status !== "idle";
  const buttonLabel =
    status === "ai"
      ? t("bank.manualImport.upload.aiExtracting")
      : status === "parsing"
        ? t("bank.manualImport.upload.parsing")
        : t("bank.manualImport.upload.chooseFile");

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-10 text-center transition-colors",
          dragOver ? "border-brand bg-brand-wash" : "border-border",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        <Upload className="size-8 text-muted-foreground" />
        <p className="text-sm text-foreground">{t("bank.manualImport.upload.dropHint")}</p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {buttonLabel}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <p className="text-xs text-muted-foreground">{t("bank.manualImport.upload.formatsHint")}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
