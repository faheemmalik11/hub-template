// Standard response envelope for server routes (raw HTTP endpoints). Server functions
// (createServerFn) return/throw plain values instead — this is only for `server.handlers`.

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
