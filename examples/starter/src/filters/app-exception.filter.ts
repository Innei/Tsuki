import type { ArgumentsHost, ExceptionFilter } from '@tsuki-hono/common';
import { createLogger, HttpException } from '@tsuki-hono/common';
import { injectable } from 'tsyringe';
import { ZodError } from 'zod';

import { AppErrorCode } from '../common/errors/app-error-code';
import { AppException } from '../common/errors/app-exception';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function jsonResponse(status: number, body: ErrorEnvelope): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function extractZodIssues(response: unknown): unknown {
  if (!response || typeof response !== 'object') return undefined;
  const candidate = (response as { errors?: unknown }).errors;
  return candidate;
}

function extractHttpMessage(response: unknown, fallback: string): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object' && 'message' in response) {
    const m = (response as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return fallback;
}

@injectable()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = createLogger('AppExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): Response {
    const { hono } = host.getContext();
    const route = `${hono.req.method} ${hono.req.url}`;

    if (exception instanceof AppException) {
      this.logRouteFailure(route, exception, exception.status);
      return jsonResponse(exception.status, {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const issues = extractZodIssues(response);

      if (issues !== undefined) {
        this.logRouteFailure(route, exception, status);
        return jsonResponse(status, {
          error: {
            code: AppErrorCode.VALIDATION_FAILED,
            message: 'Validation failed',
            details: { issues },
          },
        });
      }

      const message = extractHttpMessage(response, exception.message ?? 'Http error');
      this.logRouteFailure(route, exception, status);
      return jsonResponse(status, {
        error: { code: AppErrorCode.HTTP_ERROR, message },
      });
    }

    if (exception instanceof ZodError) {
      this.logRouteFailure(route, exception, 422);
      return jsonResponse(422, {
        error: {
          code: AppErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          details: { issues: exception.issues },
        },
      });
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`Unhandled ${route}`, error);
    return jsonResponse(500, {
      error: {
        code: AppErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      },
    });
  }

  private logRouteFailure(route: string, error: Error, status: number): void {
    if (status >= 500) {
      this.logger.error(`${route} → ${status}`, error);
    } else {
      this.logger.warn(`${route} → ${status} ${error.message}`);
    }
  }
}
