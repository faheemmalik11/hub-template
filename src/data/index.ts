/**
 * Every query and mutation the app may import.
 *
 * One folder per subject. Nothing outside `src/data/` imports a domain directly, so a hook can
 * move between them without a call site changing. See planning/10-data-layer.md.
 */

export * from "./settings";
export * from "./suppliers";
export * from "./rules";
export * from "./outgoing-invoices";
export * from "./team";
export * from "./handover";
export * from "./folders";
export * from "./categories";
export * from "./manual-bookings";
export * from "./tax";

export * from "./aliases";
export * from "./approval";
export * from "./review";
export * from "./bank";
export * from "./pipeline";
export * from "./documents";
export * from "./companies";
export * from "./properties";

export { useFeature, useFeatureGate } from "./use-feature";
export { searchTokens, searchWasDropped } from "./shared";
