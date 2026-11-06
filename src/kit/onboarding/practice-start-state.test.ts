import { describe, expect, it } from "bun:test";

import { decidePracticeStartOptions } from "./practice-start-state";

const progress = { stepIndex: 3, uploadedIds: ["a", "b"] };

describe("decidePracticeStartOptions", () => {
  it("offers only the start when nothing is stored and the mode is off", () => {
    expect(decidePracticeStartOptions({ practiceModeActive: false, progress: null })).toEqual({
      canStart: true,
      canResume: false,
      canRestart: false,
      canEndPracticeMode: false,
      sessionIsStale: false,
    });
  });

  it("offers resume and restart instead of the start when progress is stored", () => {
    const options = decidePracticeStartOptions({ practiceModeActive: false, progress });
    expect(options.canStart).toBe(false);
    expect(options.canResume).toBe(true);
    expect(options.canRestart).toBe(true);
  });

  it("flags a stale session when the mode is on but no progress is stored", () => {
    const options = decidePracticeStartOptions({ practiceModeActive: true, progress: null });
    expect(options.sessionIsStale).toBe(true);
    expect(options.canEndPracticeMode).toBe(true);
    expect(options.canStart).toBe(true);
  });

  it("does not call a session stale when progress is stored", () => {
    const options = decidePracticeStartOptions({ practiceModeActive: true, progress });
    expect(options.sessionIsStale).toBe(false);
    expect(options.canEndPracticeMode).toBe(true);
  });
});
