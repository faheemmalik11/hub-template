import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  amountPaidOut,
  runMatching,
  scoreMatch,
} from "../../../supabase/functions/_shared/matching.ts";
import type {
  MatchDocument,
  MatchTransaction,
} from "../../../supabase/functions/_shared/matching.ts";

const restaurantReceipt: MatchDocument = {
  id: "d1",
  amount_gross: 100,
  tip_amount: 15,
  document_date: "2026-09-10",
  due_date: null,
  invoice_number: "R1",
  customer_number: null,
  issuer: "Trattoria",
  supplier_iban: null,
};

const cardPayment = (amount: number): MatchTransaction => ({
  id: "t1",
  amount,
  booking_date: "2026-09-11",
  payment_reference: null,
  counterparty_iban: null,
  counterparty_holder: null,
});

describe("a bill with a tip", () => {
  test("is paid out as the printed total plus the tip", () => {
    assert.equal(amountPaidOut(restaurantReceipt), 115);
  });

  test("a missing tip changes nothing", () => {
    assert.equal(amountPaidOut({ ...restaurantReceipt, tip_amount: null }), 100);
    assert.equal(amountPaidOut({ ...restaurantReceipt, tip_amount: undefined }), 100);
  });

  test("a credit note takes no tip", () => {
    assert.equal(amountPaidOut({ ...restaurantReceipt, amount_gross: -40 }), -40);
  });

  test("matches the bank line that left the account, not the printed total", () => {
    assert.equal(scoreMatch(restaurantReceipt, cardPayment(-115)).reasons.amount, true);
    assert.equal(scoreMatch(restaurantReceipt, cardPayment(-100)).reasons.amount, false);
  });

  test("the pair is worth the whole payment, tip included", () => {
    const [candidate] = runMatching(
      [restaurantReceipt],
      [cardPayment(-115)],
      "incoming",
      0.01,
      0.4,
    );
    assert.equal(candidate.amount_matched, 115);
  });
});
