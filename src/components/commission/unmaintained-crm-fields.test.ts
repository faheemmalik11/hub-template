import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { unmaintainedCrmFieldsOf } from "./unmaintained-crm-fields.ts";
import type { Deal } from "@/data";

const complete = {
  purchase_price: 500000,
  notarised_on: "2026-11-16",
  deal_sides: [
    { side: "buyer", fee_kind: "percent", fee_net_rate: 3.57, fee_net_amount: null },
    { side: "seller", fee_kind: "percent", fee_net_rate: 3.57, fee_net_amount: null },
  ],
} as unknown as Deal;

describe("unmaintained PropStack fields", () => {
  test("a fully maintained property reports nothing", () => {
    assert.deepEqual(unmaintainedCrmFieldsOf(complete), []);
  });

  test("the four fields the briefing names are each reported", () => {
    const empty = {
      purchase_price: null,
      notarised_on: null,
      deal_sides: [
        { side: "buyer", fee_kind: "percent", fee_net_rate: null, fee_net_amount: null },
        { side: "seller", fee_kind: "percent", fee_net_rate: null, fee_net_amount: null },
      ],
    } as unknown as Deal;
    assert.deepEqual(unmaintainedCrmFieldsOf(empty), [
      "purchase_price",
      "notarised_on",
      "buyer_rate",
      "seller_rate",
    ]);
  });

  test("a side billed as a fixed amount has no rate to maintain", () => {
    const fixedBuyer = {
      ...complete,
      deal_sides: [
        { side: "buyer", fee_kind: "fixed", fee_net_rate: null, fee_net_amount: 10000 },
        { side: "seller", fee_kind: "percent", fee_net_rate: 3.57, fee_net_amount: null },
      ],
    } as unknown as Deal;
    assert.deepEqual(unmaintainedCrmFieldsOf(fixedBuyer), []);
  });

  test("a side that does not exist is not reported as a missing rate", () => {
    const buyerOnly = {
      ...complete,
      deal_sides: [
        { side: "buyer", fee_kind: "percent", fee_net_rate: 3.57, fee_net_amount: null },
      ],
    } as unknown as Deal;
    assert.deepEqual(unmaintainedCrmFieldsOf(buyerOnly), []);
  });

  test("a zero purchase price is a real value, not a missing one", () => {
    const zeroPrice = { ...complete, purchase_price: 0 } as unknown as Deal;
    assert.deepEqual(unmaintainedCrmFieldsOf(zeroPrice), []);
  });

  test("a zero rate is a real value, not a missing one", () => {
    const zeroRate = {
      ...complete,
      deal_sides: [
        { side: "buyer", fee_kind: "percent", fee_net_rate: 0, fee_net_amount: null },
        { side: "seller", fee_kind: "percent", fee_net_rate: 3.57, fee_net_amount: null },
      ],
    } as unknown as Deal;
    assert.deepEqual(unmaintainedCrmFieldsOf(zeroRate), []);
  });
});
