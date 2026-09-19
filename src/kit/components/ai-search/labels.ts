export interface AiSearchLabels {
  title: string;
  description: string;
  questionPlaceholder: string;
  questionPlaceholderShort: string;
  simpleSearch: string;
  simplePlaceholder: string;
  assistant: string;
  clear: string;
  submit: string;
  searching: string;
  error: string;
  offTopic: string;
  aggregateHint: string;
  truncated(shown: number, total: number): string;
  truncatedSimilar(shown: number, total: number): string;
}

export const englishAiSearchLabels: AiSearchLabels = {
  title: "Ask about your invoices",
  description: "Type a question in your own words, or speak it.",
  questionPlaceholder: "e.g. What did we pay for scaffolding this year?",
  questionPlaceholderShort: "Ask a question…",
  simpleSearch: "Simple search",
  simplePlaceholder: "Search invoices…",
  assistant: "AI search",
  clear: "Clear",
  submit: "Ask",
  searching: "Searching…",
  error: "The search failed. Please try again.",
  offTopic: "I can only answer questions about your invoices.",
  aggregateHint:
    "This total was computed across all matching invoices. The list below is therefore not narrowed to them.",
  truncated: (shown, total) => `Showing ${shown} of ${total} matches.`,
  truncatedSimilar: (shown, total) => `Showing the ${shown} closest of ${total} matches.`,
};
