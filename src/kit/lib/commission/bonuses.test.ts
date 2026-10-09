import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { suggestBonuses } from "./bonuses.ts";
import type { BonusDealFacts, BonusRuleSettings } from "./bonuses.ts";

const settings: BonusRuleSettings = {
  notaryAmountCents: 500_00,
  followUpAmountCents: 300_00,
  ownLeadSharePercent: 50,
  companyLeadSharePercent: 10,
  personnelFlatCents: 1_500_00,
  companyLeadDeductsCosts: true,
};

const facts: BonusDealFacts = {
  notarisedOn: "2026-09-08",
  ownLead: false,
  fromViewing: false,
  handledBy: "robin",
  acquiredBy: "robin",
  netCommissionCents: 15_000_00,
  costsCents: 500_00,
  costsClosed: true,
  allCommissionInvoicesPaid: true,
};

describe("bonus suggestions", () => {
  test("a notarised sale earns the notary bonus at once, whatever has been paid", () => {
    const [bonus] = suggestBonuses(
      { ...facts, costsClosed: false, allCommissionInvoicesPaid: false },
      settings,
    );
    assert.equal(bonus.type, "notary");
    assert.equal(bonus.state, "ready");
    assert.equal(bonus.amountCents, 500_00);
    assert.equal(bonus.earnedOn, "2026-09-08");
    assert.equal(bonus.brokerUserId, "robin");
  });

  test("the notary bonus waits for the notary date", () => {
    const [bonus] = suggestBonuses({ ...facts, notarisedOn: null }, settings);
    assert.deepEqual(bonus.state === "waiting" && bonus.waitingFor, ["notarisation"]);
  });

  test("an own lead earns half of what is left, and no notary bonus", () => {
    const bonuses = suggestBonuses({ ...facts, ownLead: true }, settings);
    assert.deepEqual(
      bonuses.map((bonus) => bonus.type),
      ["own_job_share"],
    );
    assert.equal(bonuses[0].amountCents, 6_500_00);
    assert.equal(bonuses[0].state, "ready");
  });

  test("the own-lead share waits for closed costs and paid invoices", () => {
    const [bonus] = suggestBonuses(
      { ...facts, ownLead: true, costsClosed: false, allCommissionInvoicesPaid: false },
      settings,
    );
    assert.deepEqual(bonus.state === "waiting" && bonus.waitingFor, [
      "costs_closed",
      "invoices_paid",
    ]);
    assert.equal(bonus.amountCents, 6_500_00);
  });

  test("an own lead with nothing left over earns nothing", () => {
    const [bonus] = suggestBonuses(
      { ...facts, ownLead: true, netCommissionCents: 1_800_00 },
      settings,
    );
    assert.equal(bonus.state, "no_remainder");
    assert.equal(bonus.amountCents, null);
  });

  test("a sale from a viewing adds the follow-up bonus", () => {
    const bonuses = suggestBonuses({ ...facts, fromViewing: true }, settings);
    assert.deepEqual(
      bonuses.map((bonus) => bonus.type),
      ["notary", "viewing_new_job"],
    );
    assert.equal(bonuses[1].amountCents, 300_00);
  });

  test("a company lead worked by another broker gives that broker ten percent", () => {
    const bonuses = suggestBonuses({ ...facts, acquiredBy: "julia" }, settings);
    const share = bonuses.find((bonus) => bonus.type === "company_lead_share");
    assert.equal(share?.brokerUserId, "julia");
    assert.equal(share?.amountCents, 1_450_00);
  });

  test("the ten percent can be taken on the commission before costs", () => {
    const bonuses = suggestBonuses(
      { ...facts, acquiredBy: "julia" },
      { ...settings, companyLeadDeductsCosts: false },
    );
    assert.equal(
      bonuses.find((bonus) => bonus.type === "company_lead_share")?.amountCents,
      1_500_00,
    );
  });

  test("a bonus with no broker named waits for one", () => {
    const [bonus] = suggestBonuses({ ...facts, handledBy: null, acquiredBy: null }, settings);
    assert.deepEqual(bonus.state === "waiting" && bonus.waitingFor, ["broker"]);
  });

  test("shares wait for the commission when it cannot be calculated yet", () => {
    const [bonus] = suggestBonuses({ ...facts, ownLead: true, netCommissionCents: null }, settings);
    assert.deepEqual(bonus.state === "waiting" && bonus.waitingFor, ["commission"]);
  });
});
