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

  it("remembers the last event of each type", () => {
    const bus = createOnboardingEventBus();
    assert.equal(bus.lastEventOfType("document_uploaded"), undefined);
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    bus.emit({ type: "document_uploaded", recordId: "doc-2" });
    assert.equal(bus.lastEventOfType("document_uploaded")?.recordId, "doc-2");
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

  it("completes immediately for a recordId condition already met before watching started", () => {
    const bus = createOnboardingEventBus();
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    let completed = 0;
    watchForCompletion(bus, { eventType: "document_uploaded", recordId: "doc-1" }, () => {
      completed += 1;
    });
    assert.equal(completed, 1);
  });

  it("marks a replayed completion as such, so a step revisited via Back does not bounce forward again", () => {
    const bus = createOnboardingEventBus();
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    const seen: boolean[] = [];
    watchForCompletion(
      bus,
      { eventType: "document_uploaded", recordId: "doc-1" },
      ({ fromReplay }) => seen.push(fromReplay),
    );
    assert.deepEqual(seen, [true]);
  });

  it("marks a live completion as not replayed", () => {
    const bus = createOnboardingEventBus();
    const seen: boolean[] = [];
    watchForCompletion(bus, { eventType: "document_uploaded" }, ({ fromReplay }) =>
      seen.push(fromReplay),
    );
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    assert.deepEqual(seen, [false]);
  });

  it("does not replay a past event for a different record", () => {
    const bus = createOnboardingEventBus();
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    let completed = 0;
    watchForCompletion(bus, { eventType: "document_uploaded", recordId: "doc-2" }, () => {
      completed += 1;
    });
    assert.equal(completed, 0);
  });

  it("never replays a past event for a condition without a recordId", () => {
    const bus = createOnboardingEventBus();
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    let completed = 0;
    watchForCompletion(bus, { eventType: "document_uploaded" }, () => {
      completed += 1;
    });
    assert.equal(completed, 0);
  });
});
