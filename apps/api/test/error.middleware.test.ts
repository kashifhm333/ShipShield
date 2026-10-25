import { describe, it, expect, vi } from 'vitest';
import { errorMiddleware, AppError } from '../src/middleware/error.middleware.js';
import { ZodError } from 'zod';

describe('errorMiddleware Suite', () => {
  it('formats AppError properly with custom statusCode and details', () => {
    const err = new AppError({
      code: 'TEST_ERROR',
      statusCode: 403,
      message: 'Forbidden action',
      details: [{ field: 'role', issue: 'Insufficient permissions' }],
    });

    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn();
    const res: any = { status: statusFn, json: jsonFn };
    const req: any = { id: 'req_123' };

    errorMiddleware(err, req, res, (() => {}) as any);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'TEST_ERROR',
          message: 'Forbidden action',
          request_id: 'req_123',
          details: [{ field: 'role', issue: 'Insufficient permissions' }],
        }),
      })
    );
  });

  it('formats ZodError properly with 400 INVALID_ARGUMENT', () => {
    const zodErr = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      },
    ]);

    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn();
    const res: any = { status: statusFn, json: jsonFn };
    const req: any = { id: 'req_456' };

    errorMiddleware(zodErr, req, res, (() => {}) as any);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INVALID_ARGUMENT',
          details: [{ field: 'name', issue: 'Expected string, received number' }],
        }),
      })
    );
  });

  it('formats generic unhandled Error as 500 INTERNAL_ERROR', () => {
    const genericErr = new Error('Database connection broke unexpectedly');
    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn();
    const res: any = { status: statusFn, json: jsonFn };
    const req: any = {};

    errorMiddleware(genericErr, req, res, (() => {}) as any);

    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected internal error occurred.',
        }),
      })
    );
  });
});
