import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { describeCrmFields, describeRemainingCrmFields, HEADLINE_FIELD_KEYS } from "./fields.ts";

const record = {
  street: "Musterweg",
  price: { label: "Kaufpreis", value: 575000 },
  title: { label: "Titel", value: null },
  archived: false,
  zero: 0,
  images: [{ url: "https://example.com/a.jpg" }, { url: "https://example.com/b.jpg" }],
  broker: { name: "Erika Beispiel", email: "erika@example.com" },
  property_groups: [],
  note: "",
  nothing: null,
  custom_fields: { webseite: "https://example.com" },
};

describe("describeCrmFields", () => {
  const fields = describeCrmFields(record);
  const byKey = (key: string) => fields.find((field) => field.key === key)!;

  test("every key in the record is listed, none dropped", () => {
    assert.deepEqual(fields.map((field) => field.key).sort(), Object.keys(record).sort());
  });

  test("a labelled value shows the CRM's own label and its value", () => {
    assert.equal(byKey("price").label, "Kaufpreis");
    assert.equal(byKey("price").value, 575000);
    assert.equal(byKey("price").kind, "simple");
  });

  test("a plain field is labelled by its key", () => {
    assert.equal(byKey("street").label, "street");
    assert.equal(byKey("street").value, "Musterweg");
  });

  test("false and 0 are values, not blanks", () => {
    assert.equal(byKey("archived").kind, "simple");
    assert.equal(byKey("archived").value, false);
    assert.equal(byKey("zero").kind, "simple");
    assert.equal(byKey("zero").value, 0);
  });

  test("null, empty text, empty lists and a labelled null are blank", () => {
    for (const key of ["nothing", "note", "property_groups", "title"]) {
      assert.equal(byKey(key).kind, "empty", key);
    }
  });

  test("a list or an object keeps its whole content and says how many entries", () => {
    assert.equal(byKey("images").kind, "structured");
    assert.equal(byKey("images").entryCount, 2);
    assert.deepEqual(byKey("images").structured, record.images);
    assert.deepEqual(byKey("broker").structured, record.broker);
    assert.deepEqual(byKey("custom_fields").structured, record.custom_fields);
  });
});

describe("the fields below the headline facts", () => {
  test("leave out what is shown on top and keep everything else", () => {
    const remaining = describeRemainingCrmFields({
      id: 1,
      price: { label: "Kaufpreis", value: 575000 },
      property_status: { id: 7, name: "Verkauft" },
      street: "Musterweg",
      zero: 0,
    });
    assert.deepEqual(remaining.map((field) => field.key).sort(), ["street", "zero"]);
  });

  test("nothing is dropped that is not on the headline list", () => {
    const keys = Object.keys(record).filter((key) => !HEADLINE_FIELD_KEYS.has(key));
    assert.equal(describeRemainingCrmFields(record).length, keys.length);
    assert.equal(describeCrmFields(record).length, Object.keys(record).length);
  });
});
