import { describe, expect, it } from "bun:test";

import { documentUpdatedEventData } from "./document-updated-event";

const before = { amount_net: 1420, vat_amount: 235.6, amount_gross: 1475.6 };

describe("documentUpdatedEventData", () => {
  it("adds nothing when no tracked field was changed", () => {
    expect(documentUpdatedEventData(before, {})).toEqual({});
  });

  it("reports the final amounts and that they add up after fixing the net amount", () => {
    expect(documentUpdatedEventData(before, { amount_net: 1240 })).toEqual({
      amount_net: 1240,
      vat_amount: 235.6,
      amount_gross: 1475.6,
      amounts_add_up: true,
    });
  });

  it("reports that they do not add up when the VAT was changed to a wrong value", () => {
    const data = documentUpdatedEventData(before, { amount_net: 1240, vat_amount: 2335.6 });
    expect(data.amounts_add_up).toBe(false);
    expect(data.amount_net).toBe(1240);
  });

  it("uses the amounts from before for fields that were not changed", () => {
    expect(documentUpdatedEventData(before, { vat_amount: 235.6 }).amount_net).toBe(1420);
  });

  it("reports no match when an amount is missing", () => {
    expect(
      documentUpdatedEventData({ ...before, vat_amount: null }, { amount_net: 1240 })
        .amounts_add_up,
    ).toBe(false);
  });

  it("passes the company code through untouched", () => {
    expect(documentUpdatedEventData(before, { company_code: "DEMO-ab12cd34" })).toEqual({
      company_code: "DEMO-ab12cd34",
    });
  });

  it("passes the property code through untouched", () => {
    expect(documentUpdatedEventData(before, { property_code: "DEMO-ab12cd34-P12" })).toEqual({
      property_code: "DEMO-ab12cd34-P12",
    });
  });
});
