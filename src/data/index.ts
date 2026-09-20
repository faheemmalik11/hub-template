/**
 * Every query and mutation the app may import.
 *
 * Being split by domain: `src/lib/data/queries.ts` is 9,800 lines, and each domain moves into
 * `src/data/<domain>/` a piece at a time. Everything is re-exported here, so a hook can move
 * without a single call site changing. See planning/10-data-layer.md.
 */
export * from "@/lib/data/queries";

export * from "./settings";
export * from "./suppliers";
export * from "./rules";
