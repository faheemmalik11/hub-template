import { describe, expect, it } from "bun:test";

import { validatePracticeProgress } from "./practice-progress";

const progress = { stepIndex: 3, uploadedIds: ["a", "b"] };

describe("validatePracticeProgress", () => {
  it("rejects missing progress", () => {
    expect(validatePracticeProgress(null, 10, null)).toBeNull();
  });

  it("rejects a step beyond the start without any uploaded record", () => {
    expect(validatePracticeProgress({ stepIndex: 4, uploadedIds: [] }, 10, null)).toBeNull();
  });

  it("clamps the step index into the task", () => {
    expect(
      validatePracticeProgress({ stepIndex: 99, uploadedIds: ["a"] }, 10, null)?.stepIndex,
    ).toBe(10);
    expect(
      validatePracticeProgress({ stepIndex: -2, uploadedIds: ["a"] }, 10, null)?.stepIndex,
    ).toBe(0);
  });

  it("rejects a step index that is not a whole number", () => {
    expect(validatePracticeProgress({ stepIndex: 1.5, uploadedIds: ["a"] }, 10, null)).toBeNull();
  });

  it("rejects progress whose latest record no longer exists", () => {
    expect(validatePracticeProgress(progress, 10, ["a"])).toBeNull();
  });

  it("keeps only the records that still exist", () => {
    expect(validatePracticeProgress(progress, 10, ["b"])).toEqual({
      stepIndex: 3,
      uploadedIds: ["b"],
    });
  });

  it("accepts structurally valid progress when records cannot be checked yet", () => {
    expect(validatePracticeProgress(progress, 10, null)).toEqual(progress);
  });
});
