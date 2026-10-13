import { serve } from '@hono/node-server';
import { Body, Controller, createLogger, Get, Module, Post } from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';
import { Hono } from 'hono';

const response = { message: 'Hello, world!', ok: true };

class BenchmarkController {
  getJson() {
    return response;
  }

  postJson(body: unknown) {
    return body;
  }
}

// Applying the public decorators directly avoids a benchmark-only TS decorator compiler.
Controller()(BenchmarkController);
Get('/json')(
  BenchmarkController.prototype,
  'getJson',
  Object.getOwnPropertyDescriptor(BenchmarkController.prototype, 'getJson')!,
);
Post('/json')(
  BenchmarkController.prototype,
  'postJson',
  Object.getOwnPropertyDescriptor(BenchmarkController.prototype, 'postJson')!,
);
Body()(BenchmarkController.prototype, 'postJson', 0);

class BenchmarkModule {}
Module({ controllers: [BenchmarkController] })(BenchmarkModule);

const implementation = process.argv[2];
if (implementation !== 'hono' && implementation !== 'tsuki') {
  throw new Error('Expected hono or tsuki');
}

const tsuki =
  implementation === 'tsuki'
    ? await createApplication(BenchmarkModule, {
        logger: createLogger('Benchmark', { minLevel: 'error' }),
      })
    : undefined;
const app =
  tsuki?.getInstance() ??
  new Hono()
    .get('/json', (context) => context.json(response))
    .post('/json', async (context) => context.json(await context.req.json()));

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (address) => {
  process.send?.({ port: address.port });
});

process.once('message', async (message) => {
  if (message !== 'close') return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await tsuki?.close();
  process.disconnect?.();
});
