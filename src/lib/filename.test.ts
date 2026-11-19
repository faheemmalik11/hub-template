import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildSuggestedFilename } from "./filename.ts";
import type { Document, FilenameSettings } from "./data/types.ts";

const settings: FilenameSettings = {
  id: true,
  convention: "date_type_issuer",
  separator: "_",
  date_separator: "_",
  default_type_label: "Beleg",
  vat_suffix: "",
  include_vat_suffix: false,
  include_amount: false,
  include_property: true,
  description_source: "none",
  transliterate_accents: false,
  updated_at: "2026-11-19T00:00:00Z",
  updated_by: null,
};

const doc = {
  document_date: "2026-11-16",
  document_type: "Rechnung",
  issuer: "ContentWerkRuhr",
  property_code: null,
  company_code: null,
  amount_gross: null,
  service_description: null,
  cost_category: null,
  vat_rate: null,
  vat_treatment: null,
} as unknown as Document;

describe("date_type_issuer filenames", () => {
  test("the three examples the client gave", () => {
    assert.equal(
      buildSuggestedFilename(doc, settings, "pdf", "Steinmetzstraße 2"),
      "2026_11_16_Rechnung_ContentWerkRuhr_Steinmetzstraße_2.pdf",
    );
    assert.equal(
      buildSuggestedFilename(
        { ...doc, document_type: "Gebührenbescheid", issuer: "Stadt Bottrop" } as Document,
        settings,
        "pdf",
        "Schützenstraße 75",
      ),
      "2026_11_16_Gebührenbescheid_Stadt-Bottrop_Schützenstraße_75.pdf",
    );
    assert.equal(
      buildSuggestedFilename(
        { ...doc, document_type: null, issuer: "Tankport Autowäsche" } as Document,
        settings,
        "pdf",
        null,
      ),
      "2026_11_16_Beleg_Tankport-Autowäsche.pdf",
    );
  });

  test("the property is left off when the document has none", () => {
    assert.equal(
      buildSuggestedFilename(doc, settings, "pdf", null),
      "2026_11_16_Rechnung_ContentWerkRuhr.pdf",
    );
  });

  test("the property code stands in when no address is known", () => {
    assert.equal(
      buildSuggestedFilename({ ...doc, property_code: "P-01" } as Document, settings, "pdf"),
      "2026_11_16_Rechnung_ContentWerkRuhr_P-01.pdf",
    );
  });

  test("an unknown document type falls back to the configured label", () => {
    assert.equal(
      buildSuggestedFilename({ ...doc, document_type: null } as Document, settings, "pdf", null),
      "2026_11_16_Beleg_ContentWerkRuhr.pdf",
    );
  });

  test("transliteration spells the umlauts out when switched on", () => {
    assert.equal(
      buildSuggestedFilename(
        doc,
        { ...settings, transliterate_accents: true },
        "pdf",
        "Steinmetzstraße 2",
      ),
      "2026_11_16_Rechnung_ContentWerkRuhr_Steinmetzstrasse_2.pdf",
    );
  });

  test("no name at all without a date or an issuer", () => {
    assert.equal(buildSuggestedFilename({ ...doc, issuer: null } as Document, settings), null);
    assert.equal(
      buildSuggestedFilename({ ...doc, document_date: null } as Document, settings),
      null,
    );
  });
});

describe("code_and_amount filenames stay as they were", () => {
  const legacy: FilenameSettings = {
    ...settings,
    convention: "code_and_amount",
    separator: " ",
    include_amount: true,
    description_source: "service_description",
  };

  test("the old pattern is untouched by the new convention", () => {
    const old = {
      ...doc,
      company_code: "STAY",
      amount_gross: 4850,
      service_description: "Sanitärinstallation",
      property_code: "P-01",
    } as Document;
    assert.equal(
      buildSuggestedFilename(old, legacy, "pdf"),
      "20261116 STAY ContentWerkRuhr Sanitärinstallation 4.850,00 P-01.pdf",
    );
  });
});
