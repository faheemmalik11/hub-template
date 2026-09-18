// Shared across the match-panel's own search lists only (offene-posten/index.tsx's page-level
// search boxes have their own SUCHE_DEBOUNCE_MS, a separate UI with no reason to share a literal).
// Values mirror the retired ManualLinkTab's PAGE_SIZE/SEARCH_DEBOUNCE_MS -- same picker pattern,
// same tuning, now declared once here instead of duplicated per list.
export const SEARCH_DEBOUNCE_MS = 300;
// 10, not the old picker's 40: this is a compact fallback list inside a side panel, not a
// full-screen browse-everything picker -- "Load more" covers anyone who needs the rest.
export const SEARCH_PAGE_SIZE = 10;
