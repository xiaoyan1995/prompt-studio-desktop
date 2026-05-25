export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 401);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterMs?: number) {
    super("RATE_LIMIT", "Too many requests", 429, { retryAfterMs });
    this.name = "RateLimitError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.statusCode }
    );
  }
  console.error("Unhandled error:", error);
  const devMessage = process.env.NODE_ENV === "development" && error instanceof Error
    ? error.message
    : "Internal server error";
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: devMessage } },
    { status: 500 }
  );
}
