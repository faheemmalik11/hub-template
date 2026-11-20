import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decidePracticeStartOptions } from "./practice-start-state.ts";

const progress = { stepIndex: 3, uploadedIds: ["a", "b"] };

describe("decidePracticeStartOptions", () => {
  it("offers only the start when nothing is stored and the mode is off", () => {
    assert.deepEqual(decidePracticeStartOptions({ practiceModeActive: false, progress: null }), {
      canStart: true,
      canResume: false,
      canRestart: false,
      canEndPracticeMode: false,
      sessionIsStale: false,
    });
  });

  it("offers resume and restart instead of the start when progress is stored", () => {
    const options = decidePracticeStartOptions({ practiceModeActive: false, progress });
    assert.equal(options.canStart, false);
    assert.equal(options.canResume, true);
    assert.equal(options.canRestart, true);
  });

  it("flags a stale session when the mode is on but no progress is stored", () => {
    const options = decidePracticeStartOptions({ practiceModeActive: true, progress: null });
    assert.equal(options.sessionIsStale, true);
    assert.equal(options.canEndPracticeMode, true);
    assert.equal(options.canStart, true);
  });

  it("does not call a session stale when progress is stored", () => {
    const options = decidePracticeStartOptions({ practiceModeActive: true, progress });
    assert.equal(options.sessionIsStale, false);
    assert.equal(options.canEndPracticeMode, true);
  });
});
