import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { BrokerBonus, Deal } from "@/data";
import { brokerNumbers } from "./broker-numbers.ts";

const deal = (notarised_on: string | null, status: Deal["status"] = "approved") =>
  ({ notarised_on, status }) as Deal;
const bonus = (status: BrokerBonus["status"], amount: number, earned_on = "2026-03-01") =>
  ({ status, amount, earned_on }) as BrokerBonus;

describe("brokerNumbers", () => {
  test("counts notarisations per calendar year and ignores cancelled sales", () => {
    const numbers = brokerNumbers(
      [deal("2026-02-01"), deal("2026-05-01"), deal("2025-11-01"), deal("2026-06-01", "cancelled")],
      [],
      2026,
    );
    assert.equal(numbers.notarisedThisYear, 2);
    assert.equal(numbers.notarisedLastYear, 1);
  });

  test("counts a sale without a notary date, or still incomplete, as in progress", () => {
    const numbers = brokerNumbers(
      [deal(null, "incomplete"), deal("2026-01-01", "incomplete")],
      [],
      2026,
    );
    assert.equal(numbers.salesInProgress, 2);
  });

  test("sums approved bonuses and this year's paid ones, and counts the ones to act on", () => {
    const numbers = brokerNumbers(
      [],
      [
        bonus("suggested", 500),
        bonus("submitted", 300),
        bonus("approved", 500),
        bonus("approved", 300),
        bonus("paid", 100),
        bonus("paid", 900, "2025-12-01"),
      ],
      2026,
    );
    assert.equal(numbers.bonusesToConfirm, 1);
    assert.equal(numbers.bonusesAwaitingReview, 1);
    assert.equal(numbers.bonusesApprovedNotPaid, 800);
    assert.equal(numbers.bonusesPaidThisYear, 100);
  });
});
