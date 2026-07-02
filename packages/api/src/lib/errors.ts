export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorisedError extends AppError {
  constructor(message = "Unauthorised") {
    super(message, 401, "UNAUTHORISED");
    this.name = "UnauthorisedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", public errors?: Record<string, string[]>) {
    super(message, 422, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, "TOO_MANY_REQUESTS");
    this.name = "TooManyRequestsError";
  }
}

/**
 * Sprint 1b W1 temporary scaffolding error — returned when a buyer attempts
 * to check out a cart that contains listings from more than one seller, but
 * the multi-seller checkout flow has not yet been implemented (ADR-015 W2+).
 *
 * Remove this class, its handler in server.ts, and all callers in W5 once the
 * order_groups + seller allocations checkout path ships. Grep:
 * `MultiSellerCheckoutNotSupportedError` and `MULTI_SELLER_CHECKOUT_UNSUPPORTED`.
 */
// TODO ADR-015-W5: remove once multi-seller checkout is live
export class MultiSellerCheckoutNotSupportedError extends AppError {
  constructor(public sellerCount: number) {
    super(
      `Checkout currently supports one seller per cart (found ${sellerCount}). Multi-seller checkout ships in Sprint 1b W2.`,
      422,
      "MULTI_SELLER_CHECKOUT_UNSUPPORTED",
    );
    this.name = "MultiSellerCheckoutNotSupportedError";
  }
}
