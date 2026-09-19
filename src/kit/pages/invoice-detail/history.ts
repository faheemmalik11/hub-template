import { InvoiceHistoryEntry } from "../../components/invoice-review/pipeline-types";

export interface HistoryConfig {
  legacyActionIds: string[];
  actionTargetStatus: Partial<Record<string, string>>;
  approvalHistoryTypes: string[];
}

export interface HistoryFormat {
  approvalActionLabelDe: (id: string) => string;
  workflowLabelDe: (status: string) => string;
  workflowOrder: readonly string[];
}

export interface HistoryLabels {
  typeLabel: (type: string) => string;
  stateLabel: (targetStatus: string) => string;
  corrected: string;
  queryAdditional: string;
}

const KNOWN_TYPES = [
  "notiz",
  "statuswechsel",
  "aenderung",
  "zuweisung",
  "zuordnung",
  "loeschung",
  "regel",
  "nicht_relevant",
  "archiviert",
];

export function historyTypeLabel(
  type: string,
  config: HistoryConfig,
  labels: HistoryLabels,
): string {
  const known = [...KNOWN_TYPES, ...config.approvalHistoryTypes];
  return known.includes(type) ? labels.typeLabel(type) : type;
}

function legacyActionFromText(
  text: string,
  config: HistoryConfig,
  format: HistoryFormat,
): string | null {
  for (const id of config.legacyActionIds) {
    const de = format.approvalActionLabelDe(id);
    if (!de || de === id) continue;
    if (text === de || text.startsWith(`${de}: `)) return id;
  }
  return null;
}

function legacyCorrectionTarget(text: string, format: HistoryFormat): string | null {
  const match = /^Manuell korrigiert:\s*.+?\s*→\s*(.+)$/.exec(text.trim());
  if (!match) return null;
  return format.workflowOrder.find((s) => format.workflowLabelDe(s) === match[1].trim()) ?? null;
}

export function historyComment(
  entry: InvoiceHistoryEntry,
  config: HistoryConfig,
  format: HistoryFormat,
): string | null {
  const stored = entry.data?.kommentar;
  if (typeof stored === "string" && stored.trim() !== "") return stored.trim();
  const text = entry.text?.trim();
  if (!text) return null;
  const id = legacyActionFromText(text, config, format);
  if (!id) return null;
  const de = format.approvalActionLabelDe(id);
  return text.length > de.length + 2 ? text.slice(de.length + 2) : null;
}

export function historyTargetStatus(
  entry: InvoiceHistoryEntry,
  config: HistoryConfig,
  format: HistoryFormat,
): string | null {
  const d = entry.data as { korrektur_nach?: unknown; nach?: unknown } | null;
  const raw = d?.korrektur_nach ?? d?.nach;
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  const from = entry.text ? legacyActionFromText(entry.text.trim(), config, format) : null;
  return from
    ? (config.actionTargetStatus[from] ?? null)
    : legacyCorrectionTarget(entry.text ?? "", format);
}

export function historyStateLabel(
  entry: InvoiceHistoryEntry,
  config: HistoryConfig,
  format: HistoryFormat,
  labels: HistoryLabels,
): string {
  const target = historyTargetStatus(entry, config, format);
  return target ? labels.stateLabel(target) : historyTypeLabel(entry.type, config, labels);
}

export function historyQualifier(entry: InvoiceHistoryEntry, labels: HistoryLabels): string | null {
  if (entry.type === "korrektur") return labels.corrected;
  if (entry.type === "rueckfrage") return labels.queryAdditional;
  return null;
}

export function historyLines(
  entry: InvoiceHistoryEntry,
  config: HistoryConfig,
  format: HistoryFormat,
): string[] {
  const lines = entry.data?.lines;
  if (Array.isArray(lines)) {
    const strings = lines.filter((l): l is string => typeof l === "string" && l.trim() !== "");
    if (strings.length > 0) return strings;
  }
  if (
    historyTargetStatus(entry, config, format) !== null ||
    entry.type === "korrektur" ||
    entry.type === "rueckfrage"
  ) {
    const comment = historyComment(entry, config, format);
    return comment ? [comment] : [];
  }
  return entry.text && entry.text.trim() !== "" ? [entry.text] : [];
}
