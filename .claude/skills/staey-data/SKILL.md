---
name: staey-data
description: How to read and write Supabase data in the Stäy Hub. Use when adding or changing a query/mutation, a React Query hook, a DB read/write, soft-delete, upload, cache invalidation, or the audit trail. All DB access lives in src/lib/data/queries.ts — follow its patterns exactly.
---

# Stäy data layer (`src/lib/data/queries.ts`)

**This is the ONLY file with DB calls.** Add new reads/writes here, not in components/routes.
Tables: `gesellschaften`, `lieferanten`, `belege`, `beleg_dateien`, `verarbeitungs_log`,
`beleg_verlauf`. (`imported_messages` is pipeline-only, not used in app.)

## Reads — pattern

Every read is a `useQuery` returning cast rows. Copy this shape:

```ts
export function useBelege(search?: string) {
  const q = (search ?? "").trim();
  return useQuery({
    queryKey: ["belege", q], // include every input that changes the result
    staleTime: STALE, // = 60_000
    queryFn: async (): Promise<Beleg[]> => {
      let query = supabase.from("belege").select("*").is("geloescht_am", null);
      if (q) query = query.textSearch("fts", q, { type: "websearch", config: "german" });
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Beleg[]; // reads use `as unknown as`
    },
  });
}
```

Conventions: filter soft-deleted with `.is("geloescht_am", null)` on list reads (note:
`useBeleg(id)` does NOT — a soft-deleted invoice is still URL-reachable). Single row →
`.maybeSingle()` returning `T | null`. Full-text search uses the generated `fts` tsvector column.

## Writes — pattern

The generated `Database` type is empty, so writes go through an **untyped cast**:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any; // module-level, already defined
```

All mutations use `sb` (not `supabase`) so payloads don't resolve to `never`. Keep new mutations
consistent with this until DB types are regenerated. Mutation shape:

```ts
export function useUpdateBeleg(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { changes: Partial<Beleg>; protokoll?: {...} }) => {
      const { error } = await sb.from("belege")
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", belegId);
      if (error) throw error;
      if (args.protokoll) await insertVerlauf(belegId, args.protokoll.typ, ...);
    },
    onSuccess: () => {                        // ALWAYS invalidate the affected read keys
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}
```

## Query keys (keep invalidations in sync)

`["gesellschaften"]` · `["lieferanten"]` · `["lieferant", id]` · `["belege", q]` · `["beleg", id]` ·
`["beleg_datei", id]` · `["verarbeitungs_log"]` · `["verarbeitungs_log","beleg",id]` · `["beleg_verlauf", id]`.

## Audit trail — every meaningful write logs to `beleg_verlauf`

Use the `insertVerlauf(belegId, typ, text, daten?)` helper. `typ` ∈
`notiz | statuswechsel | aenderung | zuweisung | loeschung`. `actor` = logged-in email via
`actorEmail()` (best-effort). Existing mutations: `useUpdateBeleg`, `useAddNotiz`,
`useSoftDeleteBeleg`, `useUpdateLieferant`, `useSoftDeleteLieferant`, `useCreateUploadBelege`.

## Soft-delete (never hard-delete — audit-proof / revisionssicher)

Set `geloescht_am` + `geloescht_von` (actor) + `loesch_grund`, then log a `loeschung` verlauf entry.

## Files (bytea, not Supabase Storage)

`beleg_dateien.inhalt` is Postgres `bytea`, transported as hex `"\\x..."`. Write: `fileToHex(file)`
(in `upload.tsx`). Read back: `hexToUint8Array(hex)` → Blob → object URL (helpers in queries.ts).
`resolveMime()` maps octet-stream → real MIME by extension. Upload = two non-transactional inserts
(`belege` then `beleg_dateien`) — a mid-failure orphans a row (known risk).

## Gotchas

- Number parsing on save is naive: German `"1.234,56"` → `replace(",",".")` → `NaN` → stored `null`.
- Company edit writes `gesellschaft_code` but NOT the FK `gesellschaft_id` (goes stale).
- No pagination — `useBelege` loads the whole table.
  See `staey-gotchas` and `docs/CODEBASE_AUDIT.md` §6–§10 for the full list.
