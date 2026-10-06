import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { calculateDealForm, formatDecimal, parseDecimal, saveInputOf } from "./deal-form.ts";
import type { DealForm } from "./deal-form.ts";

describe("parseDecimal", () => {
  test("reads German and plain numbers", () => {
    assert.equal(parseDecimal("2,5"), 2.5);
    assert.equal(parseDecimal("610.000"), 610000);
    assert.equal(parseDecimal("610.000,50 €"), 610000.5);
    assert.equal(parseDecimal("2.975"), 2975);
    assert.equal(parseDecimal("2.5"), 2.5);
    assert.equal(parseDecimal("3 %"), 3);
  });

  test("what is shown reads back as the same number", () => {
    for (const value of [499000, 2.5, 2000, 610000.5, 3]) {
      assert.equal(parseDecimal(formatDecimal(value)), value);
    }
  });

  test("an empty or unreadable field is null, not zero", () => {
    assert.equal(parseDecimal(""), null);
    assert.equal(parseDecimal("abc"), null);
  });
});

const form: DealForm = {
  companyId: "company",
  notarisedOn: "2026-09-08",
  purchasePrice: "610.000",
  vatRate: "19",
  note: "",
  buyer: {
    enabled: true,
    feeKind: "percent",
    rate: "2,5",
    amount: "",
    discount: "",
    discountReason: "",
    parties: [
      { customerId: "b1", share: "" },
      { customerId: "b2", share: "" },
    ],
  },
  seller: {
    enabled: true,
    feeKind: "percent",
    rate: "2,5",
    amount: "",
    discount: "2.000",
    discountReason: "Kulanz",
    parties: [
      { customerId: "s1", share: "" },
      { customerId: "s2", share: "" },
    ],
  },
};

describe("deal form", () => {
  test("calculates the same invoices as the issued ones", () => {
    const result = calculateDealForm(form);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.invoices.map((invoice) => invoice.totalGrossCents),
      [9_073_75, 9_073_75, 8_073_75, 8_073_75],
    );
  });

  test("a side switched off is neither calculated nor saved", () => {
    const sellerOnly = { ...form, buyer: { ...form.buyer, enabled: false } };
    const result = calculateDealForm(sellerOnly);
    assert.equal(result.ok && result.invoices.every((invoice) => invoice.side === "seller"), true);
    assert.deepEqual(
      saveInputOf(sellerOnly).sides.map((side) => side.side),
      ["seller"],
    );
  });

  test("saves numbers, not the text typed", () => {
    const saved = saveInputOf(form);
    assert.equal(saved.deal.purchase_price, 610000);
    assert.equal(saved.sides[1].discount_gross, 2000);
    assert.equal(saved.sides[0].fee_net_rate, 2.5);
    assert.equal(saved.sides[0].fee_net_amount, null);
  });
});
