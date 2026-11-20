import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eventMeetsCompletionCondition } from "./completion.ts";
import { createOnboardingEventBus } from "./event-bus.ts";
import { watchForCompletion } from "./watch-for-completion.ts";

describe("eventMeetsCompletionCondition", () => {
  const event = { type: "document_uploaded", recordId: "doc-1", at: 1 };

  it("matches on the event type alone when nothing else is asked", () => {
    assert.equal(eventMeetsCompletionCondition({ eventType: "document_uploaded" }, event), true);
  });

  it("refuses a different event type", () => {
    assert.equal(eventMeetsCompletionCondition({ eventType: "document_opened" }, event), false);
  });

  it("checks the record id when one is asked for", () => {
    assert.equal(
      eventMeetsCompletionCondition({ eventType: "document_uploaded", recordId: "doc-1" }, event),
      true,
    );
    assert.equal(
      eventMeetsCompletionCondition({ eventType: "document_uploaded", recordId: "doc-2" }, event),
      false,
    );
  });

  it("checks every key asked for in data", () => {
    const withData = { ...event, data: { actionId: "approve", nextStatus: "approved_final" } };
    assert.equal(
      eventMeetsCompletionCondition(
        { eventType: "document_uploaded", data: { actionId: "approve" } },
        withData,
      ),
      true,
    );
    assert.equal(
      eventMeetsCompletionCondition(
        { eventType: "document_uploaded", data: { actionId: "reject" } },
        withData,
      ),
      false,
    );
  });
});

describe("createOnboardingEventBus", () => {
  it("delivers an emitted event to every subscriber, stamped with a time", () => {
    const bus = createOnboardingEventBus();
    const received: unknown[] = [];
    bus.subscribe((event) => received.push(event));
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    assert.equal(received.length, 1);
    assert.equal((received[0] as { type: string }).type, "document_uploaded");
    assert.equal(typeof (received[0] as { at: number }).at, "number");
  });

  it("stops delivering once a subscriber unsubscribes", () => {
    const bus = createOnboardingEventBus();
    const received: unknown[] = [];
    const unsubscribe = bus.subscribe((event) => received.push(event));
    unsubscribe();
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    assert.equal(received.length, 0);
  });
});

describe("watchForCompletion", () => {
  it("calls onComplete only once the condition is met", () => {
    const bus = createOnboardingEventBus();
    let completed = 0;
    watchForCompletion(bus, { eventType: "document_uploaded" }, () => {
      completed += 1;
    });
    bus.emit({ type: "document_opened", recordId: "doc-1" });
    assert.equal(completed, 0);
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    assert.equal(completed, 1);
  });
});
