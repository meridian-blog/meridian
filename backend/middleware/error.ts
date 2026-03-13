/**
 * Global Error Handler Middleware
 */

import type { Context, Next } from '@oak/oak';

interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, string[]>;
}

export async function errorHandler(ctx: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    const error = err as ApiError & { fields?: { code?: string } };

    // Handle PostgreSQL invalid UUID errors gracefully
    if (
      error.fields?.code === '22P02' ||
      error.message?.includes('invalid input syntax for type uuid')
    ) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid ID format' },
      };
      return;
    }

    // Handle PostgreSQL column/operator errors
    if (error.fields?.code === '42883' || error.fields?.code === '42703') {
      console.error('Database schema error:', error.message);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      };
      return;
    }

    console.error('Error:', error);

    const status = error.status || 500;
    const code = error.code || 'INTERNAL_ERROR';

    ctx.response.status = status;
    ctx.response.body = {
      success: false,
      error: {
        code,
        message: error.message || 'An unexpected error occurred',
        details: error.details,
      },
    };
  }
}

// Helper to create errors
export function createError(
  message: string,
  status: number,
  code: string,
  details?: Record<string, string[]>,
): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}
