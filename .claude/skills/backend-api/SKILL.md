---
name: backend-api
description: How to build backend REST endpoints and server functions in the this Hub — TanStack Start server routes/server functions, request validation, standard response envelope, typed errors, and middleware. Use when adding a new API endpoint or third-party integration (Airtable, Qonto, etc.), a createServerFn, anything under src/routes/api or src/lib/api, or when asked about "backend", "REST API", or "validation" in this repo.
---

# this Hub backend API conventions

This repo runs on **TanStack Start**, which already has a real backend (routing/SSR framework
with server routes, server functions, and middleware — not just a client SPA). There is **no
reason to reach for Next.js** for any of this; see `docs/` discussion history if that comes up
again. This skill is the mandatory pattern for new backend work here.

Verified against the installed version (`@tanstack/react-start@1.168.32`, checked directly
against its type definitions and the vendor skills shipped in
`node_modules/@tanstack/start-client-core/skills/start-core/*`). **If node_modules gets
reinstalled at a different version, re-check those vendor skills before trusting old syntax** —
TanStack Start's server-route API changed shape at least once (`createAPIFileRoute` →
`createServerFileRoute` → the current `server.handlers` property used below).

## Two backend primitives — pick by caller

| Need                                                            | Use                                                   | Called from                             |
| --------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| RPC-style call from a React component/loader (most cases)       | `createServerFn`                                      | `loader`, event handlers, `useServerFn` |
| Raw HTTP endpoint (webhook receiver, external service calls in) | server route (`server.handlers` on `createFileRoute`) | any HTTP client, curl, a third party    |

Default to `createServerFn` unless something outside this app's own frontend needs to call the
endpoint directly (e.g. a Qonto/Airtable webhook).

## Server route (raw REST endpoint)

```ts
// src/routes/api/airtable-sync.ts
import { createFileRoute } from "@tanstack/react-router";
import { validateBody } from "@/lib/api/validate";
import { ok, fail } from "@/lib/api/response";
import { AirtableSyncSchema } from "./airtable-sync.schema";

export const Route = createFileRoute("/api/airtable-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = validateBody(AirtableSyncSchema, await request.json());
          // ... do the work
          return ok({ synced: true, table: body.table });
        } catch (error) {
          return fail(error);
        }
      },
    },
  },
});
```

Do **not** use `createAPIFileRoute` from `@tanstack/react-start/api` — that export does not exist
in this version and will fail to import. Handlers receive `{ request, params, context, pathname, next }`.
Always `await request.json()` — it returns a Promise.

## Server function (RPC from the frontend)

```ts
// src/lib/api/airtable.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { AirtableSyncSchema } from "./airtable-sync.schema";

export const syncAirtable = createServerFn({ method: "POST" })
  .validator(AirtableSyncSchema) // NOT .inputValidator() — that method is deprecated
  .handler(async ({ data }) => {
    // data is typed + validated
    return { synced: true, table: data.table };
  });
```

`src/lib/api/example.functions.ts` (already in the repo) uses the deprecated `.inputValidator()`
— don't copy that file's pattern for new code; use `.validator()` instead.

## Mandatory: validation, response envelope, typed errors

Every new endpoint (server route or server function) follows this shape. Create these three
files once, reuse everywhere:

**`src/lib/api/errors.ts`**

```ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
  }
}
export class ValidationError extends AppError {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message, 400, "VALIDATION_ERROR");
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}
```

**`src/lib/api/response.ts`**

```ts
import { AppError } from "./errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ success: true, data }, init);
}

export function fail(error: unknown) {
  const isApp = error instanceof AppError;
  console.error(error);
  return Response.json(
    {
      success: false,
      error: {
        code: isApp ? error.code : "INTERNAL_ERROR",
        message: isApp ? error.message : "Internal server error",
      },
    },
    { status: isApp ? error.statusCode : 500 },
  );
}
```

**`src/lib/api/validate.ts`**

```ts
import { z } from "zod";
import { ValidationError } from "./errors";

export function validateBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError("Invalid request body", result.error.flatten());
  return result.data;
}
```

Every server-route response is `{ success: true, data }` or
`{ success: false, error: { code, message } }` — no ad-hoc shapes. Every `createServerFn` throws
an `AppError` subclass on failure instead of a bare `Error` — the caller gets it as a rejected
promise and can branch on `error.code`.

**Language rule interaction** (see `CLAUDE.md`): `AppError.message` and `code` are internal/log
text → stay in **English**, like all code. If a failure needs to reach the user, translate a
German string at the point the frontend renders the error — never bake German into the thrown
error message itself, and never surface `error.message` directly in the UI untranslated.

## Middleware — reuse, don't reinvent

Global middleware is already wired in `src/start.ts` (`requestMiddleware`, `functionMiddleware`).
Auth already exists as `requireSupabaseAuth` / `attachSupabaseAuth` in
`src/integrations/supabase/auth-middleware.ts` / `auth-attacher.ts` — attach that to any new
`createServerFn` or server route that touches private data instead of writing a new auth check.
Two middleware kinds, don't confuse them:

- **Request middleware** (`createMiddleware().server(...)`) — runs on every request (SSR, routes,
  functions). No client phase, no input validation.
- **Function middleware** (`createMiddleware({ type: "function" }).client(...).server(...)`) —
  server-function-only, has a client phase, supports `.validator()`.
  Method order is enforced by TypeScript: `.middleware()` → `.validator()` → `.client()` → `.server()`.

A route `beforeLoad` guard is UX only — it protects the page, not the endpoint. Any
`createServerFn`/server route reading or writing private data needs its own auth middleware or
in-handler check, since it's independently callable.

## Where this does NOT apply

The Qonto/bank-transaction integration (`docs/BANKSAPI_*`) runs through **Supabase Edge Functions**
(`supabase/functions/bank-sync`, `bank-connect`, `bank-callback`), not this app's TanStack Start
backend — different runtime (Deno, deployed to Supabase), different deploy path. Don't move that
logic into `src/routes/api` or vice versa; keep the two backend surfaces separate unless a
decision is made to consolidate them.

## Common mistakes (from TanStack's own vendor skill + this repo's history)

- Using `createAPIFileRoute` (old API, doesn't exist in this version) — use `server.handlers` on `createFileRoute`.
- Using `.inputValidator()` on `createServerFn` — deprecated, use `.validator()`.
- Putting DB calls or secrets in a route `loader` — loaders are **isomorphic** (run on client too); server-only code belongs in `createServerFn` or a server route handler.
- Forgetting `await` on `request.json()` / `request.text()` / `request.formData()`.
- Returning a bare `Error` from a server function instead of an `AppError` subclass — callers lose the `code`/`statusCode` to branch on.
- Trusting client-sent IDs after only validating their _shape_ (`z.string().uuid()`) — that proves well-formed, not authorized. Re-check ownership/membership against the session before using a client-supplied ID as a query key.

## Cross-references

- `node_modules/@tanstack/start-client-core/skills/start-core/*/SKILL.md` — TanStack's own
  version-matched skills (server-routes, server-functions, middleware, auth-server-primitives,
  execution-model, deployment). Re-read these directly if TanStack Start is upgraded — don't trust
  this file's syntax blindly across a major version bump.
- `data-layer` — Supabase read/write conventions for the existing client-side query layer.
- `i18n` — German-UI / English-code rule in full.
  unused as of the last audit; confirm current usage before assuming it's live).
