import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppErrorOptions {
  code: string;
  statusCode: number;
  message: string;
  details?: Array<{ field?: string; issue: string }> | undefined;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Array<{ field?: string; issue: string }> | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id || 'unknown';
  const timestamp = new Date().toISOString();

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        request_id: requestId,
        timestamp,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'Payload validation failure.',
        request_id: requestId,
        timestamp,
        details: err.issues.map((i) => ({
          field: i.path.join('.'),
          issue: i.message,
        })),
      },
    });
    return;
  }

  // Generic 500 internal error with sanitized message
  console.error(`[UnhandledError] ${err.stack || err.message}`);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred.',
      request_id: requestId,
      timestamp,
    },
  });
}
