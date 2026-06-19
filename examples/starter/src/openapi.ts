import { createOpenApiDocument } from '@tsuki-hono/openapi';
import type { Hono } from 'hono';

import { AppModules } from './modules/index.module';

export interface RegisterOpenApiOptions {
  globalPrefix: string;
}

function normalizePrefix(prefix: string): string {
  if (!prefix || prefix === '/') return '';
  const withLeading = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return withLeading.replace(/\/+$/, '');
}

export function registerOpenApiRoutes(app: Hono, options: RegisterOpenApiOptions): void {
  const prefix = normalizePrefix(options.globalPrefix);

  const document = createOpenApiDocument(AppModules, {
    title: 'Tsuki Starter API',
    version: '0.0.0',
    description: 'OpenAPI spec generated from decorators',
    servers: prefix ? [{ url: prefix }] : undefined,
  });

  app.get('/internal/openapi.json', (c) => c.json(document));
  app.get('/internal/docs', (c) => {
    c.header('content-type', 'text/html; charset=utf-8');
    return c.html(renderScalarHtml('/internal/openapi.json'));
  });
}

function renderScalarHtml(specUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <title>Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', { url: '${specUrl}' })
    </script>
  </body>
</html>`;
}
