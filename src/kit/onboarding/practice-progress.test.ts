import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validatePracticeProgress } from "./practice-progress.ts";

const progress = { stepIndex: 3, uploadedIds: ["a", "b"] };

describe("validatePracticeProgress", () => {
  it("rejects missing progress", () => {
    assert.equal(validatePracticeProgress(null, 10, null), null);
  });

  it("rejects a step beyond the start without any uploaded record", () => {
    assert.equal(validatePracticeProgress({ stepIndex: 4, uploadedIds: [] }, 10, null), null);
  });

  it("clamps the step index into the task", () => {
    assert.equal(
      validatePracticeProgress({ stepIndex: 99, uploadedIds: ["a"] }, 10, null)?.stepIndex,
      10,
    );
    assert.equal(
      validatePracticeProgress({ stepIndex: -2, uploadedIds: ["a"] }, 10, null)?.stepIndex,
      0,
    );
  });

  it("rejects a step index that is not a whole number", () => {
    assert.equal(validatePracticeProgress({ stepIndex: 1.5, uploadedIds: ["a"] }, 10, null), null);
  });

  it("rejects progress whose latest record no longer exists", () => {
    assert.equal(validatePracticeProgress(progress, 10, ["a"]), null);
  });

  it("keeps only the records that still exist", () => {
    assert.deepEqual(validatePracticeProgress(progress, 10, ["b"]), {
      stepIndex: 3,
      uploadedIds: ["b"],
    });
  });

  it("accepts structurally valid progress when records cannot be checked yet", () => {
    assert.deepEqual(validatePracticeProgress(progress, 10, null), progress);
  });
});
