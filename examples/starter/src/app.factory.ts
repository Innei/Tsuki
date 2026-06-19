import { createLogger, createZodValidationPipe } from '@tsuki-hono/common';
import type { HonoHttpApplication } from '@tsuki-hono/core';
import { createApplication } from '@tsuki-hono/core';
import { Hono } from 'hono';

import { AppErrorCode } from './common/errors/app-error-code';
import { env } from './env';
import { AppExceptionFilter } from './filters/app-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { AppModules } from './modules/index.module';
import { registerOpenApiRoutes } from './openapi';

export interface BootstrapOptions {
  globalPrefix: string;
}

const isDevelopment = env.NODE_ENV !== 'production';

const GlobalValidationPipe = createZodValidationPipe({
  transform: true,
  whitelist: true,
  errorHttpStatusCode: 422,
  forbidUnknownValues: true,
  enableDebugMessages: isDevelopment,
  stopAtFirstError: true,
});

const honoErrorLogger = createLogger('HonoErrorHandler');

export async function createConfiguredApp(options: BootstrapOptions): Promise<HonoHttpApplication> {
  const hono = new Hono();
  registerOpenApiRoutes(hono, { globalPrefix: options.globalPrefix });

  const app = await createApplication(AppModules, { globalPrefix: options.globalPrefix }, hono);

  app.useGlobalFilters(new AppExceptionFilter());
  if (isDevelopment) {
    app.useGlobalInterceptors(new LoggingInterceptor());
  }
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(new GlobalValidationPipe());

  hono.onError((error, context) => {
    honoErrorLogger.error(`Unhandled ${context.req.method} ${context.req.url}`, error);
    return new Response(
      JSON.stringify({
        error: { code: AppErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
      }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  });

  return app;
}
