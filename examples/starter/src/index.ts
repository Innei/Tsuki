import 'reflect-metadata';

import { serve } from '@hono/node-server';
import { createLogger } from '@tsuki-hono/common';
import { green } from 'picocolors';

import { APP_GLOBAL_PREFIX } from './app.constants';
import { createConfiguredApp } from './app.factory';
import { runCliPipeline } from './cli';
import { env } from './env';

process.title = 'tsuki-starter';

const logger = createLogger('Bootstrap');

async function bootstrap() {
  const start = performance.now();
  const app = await createConfiguredApp({ globalPrefix: APP_GLOBAL_PREFIX });
  const hono = app.getInstance();

  serve({ fetch: hono.fetch, port: env.PORT, hostname: env.HOSTNAME });

  const ms = (performance.now() - start).toFixed(2);
  logger.info(
    `HTTP server on http://${env.HOSTNAME}:${env.PORT}${APP_GLOBAL_PREFIX} ${green(`+${ms}ms`)}`,
  );
  logger.info(`API docs at http://${env.HOSTNAME}:${env.PORT}/internal/docs`);
}

async function main() {
  const handledByCli = await runCliPipeline(process.argv.slice(2));
  if (handledByCli) return;
  await bootstrap();
}

main().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
