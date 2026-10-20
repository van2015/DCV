import type { ApiErrorBody } from "@dcv/shared";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toApiError(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details })
        }
      }
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        error: {
          code: "internal_error",
          message: error.message
        }
      }
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Error inesperado"
      }
    }
  };
}
