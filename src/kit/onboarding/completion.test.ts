import { describe, expect, it } from "bun:test";

import { eventMeetsCompletionCondition } from "./completion";
import { createOnboardingEventBus } from "./event-bus";
import { watchForCompletion } from "./watch-for-completion";

describe("eventMeetsCompletionCondition", () => {
  const event = { type: "document_uploaded", recordId: "doc-1", at: 1 };

  it("matches on the event type alone when nothing else is asked", () => {
    expect(eventMeetsCompletionCondition({ eventType: "document_uploaded" }, event)).toBe(true);
  });

  it("refuses a different event type", () => {
    expect(eventMeetsCompletionCondition({ eventType: "document_opened" }, event)).toBe(false);
  });

  it("checks the record id when one is asked for", () => {
    expect(
      eventMeetsCompletionCondition({ eventType: "document_uploaded", recordId: "doc-1" }, event),
    ).toBe(true);
    expect(
      eventMeetsCompletionCondition({ eventType: "document_uploaded", recordId: "doc-2" }, event),
    ).toBe(false);
  });

  it("checks every key asked for in data", () => {
    const withData = { ...event, data: { actionId: "approve", nextStatus: "approved_final" } };
    expect(
      eventMeetsCompletionCondition(
        { eventType: "document_uploaded", data: { actionId: "approve" } },
        withData,
      ),
    ).toBe(true);
    expect(
      eventMeetsCompletionCondition(
        { eventType: "document_uploaded", data: { actionId: "reject" } },
        withData,
      ),
    ).toBe(false);
  });
});

describe("createOnboardingEventBus", () => {
  it("delivers an emitted event to every subscriber, stamped with a time", () => {
    const bus = createOnboardingEventBus();
    const received: unknown[] = [];
    bus.subscribe((event) => received.push(event));
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("document_uploaded");
    expect(typeof (received[0] as { at: number }).at).toBe("number");
  });

  it("stops delivering once a subscriber unsubscribes", () => {
    const bus = createOnboardingEventBus();
    const received: unknown[] = [];
    const unsubscribe = bus.subscribe((event) => received.push(event));
    unsubscribe();
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    expect(received).toHaveLength(0);
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
    expect(completed).toBe(0);
    bus.emit({ type: "document_uploaded", recordId: "doc-1" });
    expect(completed).toBe(1);
  });
});
