// Typed errors for backend endpoints (server routes and server functions). Every new endpoint
// throws one of these instead of a bare Error, so the caller can branch on `code` rather than
// parsing a message string. See the staey-backend-api skill for the full convention.

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

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

// An OpenAI API call (bank-statement PDF extraction) failed or returned an error status.
export class OpenAiApiError extends AppError {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message, 502, "OPENAI_ERROR");
  }
}
