export interface IntentConsoleLabels {
  title: string;
  pending: string;
  empty: string;
  sqlTitle: string;
  copySql: string;
  copied: string;
  rejectedClause: string;
  unsupported: string;
  offTopic: string;
}

export const englishIntentConsoleLabels: IntentConsoleLabels = {
  title: "Intent console",
  pending: "Classifying…",
  empty: "Ask a question to see its classified intent.",
  sqlTitle: "Generated SQL",
  copySql: "Copy SQL",
  copied: "Copied",
  rejectedClause: "Rejected by the validator:",
  unsupported: "Not expressible:",
  offTopic: "Off-topic — no query generated.",
};
