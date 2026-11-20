import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { documentUpdatedEventData } from "./document-updated-event.ts";

const before = { amount_net: 1420, vat_amount: 235.6, amount_gross: 1475.6 };

describe("documentUpdatedEventData", () => {
  it("adds nothing when no tracked field was changed", () => {
    assert.deepEqual(documentUpdatedEventData(before, {}), {});
  });

  it("reports the final amounts and that they add up after fixing the net amount", () => {
    assert.deepEqual(documentUpdatedEventData(before, { amount_net: 1240 }), {
      amount_net: 1240,
      vat_amount: 235.6,
      amount_gross: 1475.6,
      amounts_add_up: true,
    });
  });

  it("reports that they do not add up when the VAT was changed to a wrong value", () => {
    const data = documentUpdatedEventData(before, { amount_net: 1240, vat_amount: 2335.6 });
    assert.equal(data.amounts_add_up, false);
    assert.equal(data.amount_net, 1240);
  });

  it("uses the amounts from before for fields that were not changed", () => {
    assert.equal(documentUpdatedEventData(before, { vat_amount: 235.6 }).amount_net, 1420);
  });

  it("reports no match when an amount is missing", () => {
    assert.equal(
      documentUpdatedEventData({ ...before, vat_amount: null }, { amount_net: 1240 })
        .amounts_add_up,
      false,
    );
  });

  it("passes the company code through untouched", () => {
    assert.deepEqual(documentUpdatedEventData(before, { company_code: "DEMO-ab12cd34" }), {
      company_code: "DEMO-ab12cd34",
    });
  });

  it("passes the property code through untouched", () => {
    assert.deepEqual(documentUpdatedEventData(before, { property_code: "DEMO-ab12cd34-P12" }), {
      property_code: "DEMO-ab12cd34-P12",
    });
  });
});
