export interface FileNamingLabels {
  title: string;
  subtitle: string;
  readOnlyHint: string;
  forwardOnlyHint: string;
  lastChanged: (who: string, when: string) => string;
  unknownPerson: string;
  driftedFromStandard: string;
  restoreStandard: string;
  structureCard: { title: string; description: string };
  separatorField: string;
  separatorInvalid: string;
  vatSuffixField: string;
  vatSuffixInvalid: string;
  vatSuffixJoinerHint: string;
  includeVatSuffix: string;
  includeAmount: string;
  includeProperty: string;
  transliterateUmlauts: string;
  descriptionCard: { title: string; description: string };
  descriptionSourceField: string;
  descriptionSource: Record<"service_description" | "cost_category" | "none", string>;
  save: string;
  saving: string;
  saved: string;
  saveFailed: (error: string) => string;
  previewCard: { title: string; description: string };
  previewEmpty: string;
  previewCase: { withoutPropertyOrDescription: string; minimal: string };
  previewTypeHint: string;
}

export const englishFileNamingLabels: FileNamingLabels = {
  title: "File naming",
  subtitle: "The naming pattern applied to every incoming document.",
  readOnlyHint: "You can view this page but not change it.",
  forwardOnlyHint:
    "A change only applies to documents processed from now on. One pattern applies to the whole Hub, not per company.",
  lastChanged: (who, when) => `Last changed by ${who} on ${when}.`,
  unknownPerson: "an unknown person",
  driftedFromStandard: "These settings no longer match the recommended pattern.",
  restoreStandard: "Restore recommended pattern",
  structureCard: {
    title: "File name structure",
    description: "What goes into the file name, and in what order.",
  },
  separatorField: "Separator",
  separatorInvalid: 'Enter a separator with no /, \\, :, *, ?, ", <, >, or |.',
  vatSuffixField: "VAT marker",
  vatSuffixInvalid: 'Enter a VAT marker with no /, \\, :, *, ?, ", <, >, or |.',
  vatSuffixJoinerHint:
    "This is joined to the company code with an underscore, not the separator above.",
  includeVatSuffix: "Add the VAT marker",
  includeAmount: "Add the amount",
  includeProperty: "Add the property code",
  transliterateUmlauts: "Spell out ä, ö, ü and ß",
  descriptionCard: {
    title: "Description",
    description: "Which field fills the description part of the name.",
  },
  descriptionSourceField: "Description source",
  descriptionSource: {
    service_description: "Service description",
    cost_category: "Cost category",
    none: "None",
  },
  save: "Save",
  saving: "Saving …",
  saved: "Saved.",
  saveFailed: (error) => `Saving failed: ${error}`,
  previewCard: { title: "Preview", description: "How today's settings turn into a file name." },
  previewEmpty: "Not enough data for a preview.",
  previewCase: {
    withoutPropertyOrDescription: "Without a property or a description",
    minimal: "With only the earliest extracted fields",
  },
  previewTypeHint:
    "The document type is never part of the name — the destination folder already says it.",
};
