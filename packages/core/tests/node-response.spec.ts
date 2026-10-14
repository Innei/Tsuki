import { serve } from '@hono/node-server';
import { Controller, Get, HttpContext, Module } from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';
import type { Context } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const NativeRequest = globalThis.Request;
const NativeResponse = globalThis.Response;
let app: Awaited<ReturnType<typeof createApplication>> | undefined;
let server: ReturnType<typeof serve> | undefined;

async function listen(): Promise<string> {
  return new Promise((resolve) => {
    server = serve(
      { fetch: (request) => app!.getInstance().fetch(request), hostname: '127.0.0.1', port: 0 },
      ({ port }) => resolve(`http://127.0.0.1:${port}`),
    );
  });
}

afterEach(async () => {
  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await app?.close();
  } finally {
    globalThis.Request = NativeRequest;
    globalThis.Response = NativeResponse;
    server = undefined;
    app = undefined;
  }
});

describe('Node adapter responses', () => {
  it('preserves header and cookie mutations when an interceptor clones a response', async () => {
    @Controller()
    class ResponsesController {
      @Get('/json')
      json(context: Context) {
        context.status(201);
        return { value: 'json' };
      }

      @Get('/explicit')
      explicit() {
        return new Response('explicit', {
          status: 202,
          headers: { 'x-remove': 'old', 'set-cookie': 'original=1' },
        });
      }
    }

    @Module({ controllers: [ResponsesController] })
    class ResponsesModule {}

    app = await createApplication(ResponsesModule);
    app.useGlobalInterceptors({
      async intercept(_context, next) {
        const response = await next.handle();
        response.headers.set('x-updated', 'yes');
        response.headers.delete('x-remove');
        response.headers.append('set-cookie', 'first=1');
        response.headers.append('set-cookie', 'second=2');
        const clone = response.clone();
        await clone.text();
        return response;
      },
    });
    const origin = await listen();

    for (const [path, status, body, cookies] of [
      ['/json', 201, '{"value":"json"}', ['first=1', 'second=2']],
      ['/explicit', 202, 'explicit', ['original=1', 'first=1', 'second=2']],
    ] as const) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(status);
      expect(response.headers.get('x-updated')).toBe('yes');
      expect(response.headers.has('x-remove')).toBe(false);
      expect(response.headers.getSetCookie()).toEqual(cookies);
      expect(await response.text()).toBe(body);
    }
  });

  it('accepts native response clones returned by nested interceptors', async () => {
    @Controller()
    class CloneController {
      @Get('/')
      handle() {
        return 'original';
      }
    }

    @Module({ controllers: [CloneController] })
    class CloneModule {}

    app = await createApplication(CloneModule);
    app.useGlobalInterceptors(
      {
        async intercept(_context, next) {
          const response = await next.handle();
          response.headers.set('x-outer', 'yes');
          response.headers.append('set-cookie', 'outer=1');
          return response.clone();
        },
      },
      {
        async intercept(_context, next) {
          await next.handle();
          const response = new Response('replacement', {
            status: 203,
            headers: { 'x-inner': 'yes' },
          });
          response.headers.append('set-cookie', 'inner=1');
          return response;
        },
      },
    );
    const origin = await listen();

    const response = await fetch(origin);
    expect(response.status).toBe(203);
    expect(response.headers.get('x-inner')).toBe('yes');
    expect(response.headers.get('x-outer')).toBe('yes');
    expect(response.headers.getSetCookie()).toEqual(['inner=1', 'outer=1']);
    expect(await response.text()).toBe('replacement');
  });

  it('accepts native responses and controller clones without interceptors', async () => {
    @Controller()
    class NativeController {
      @Get('/native')
      native() {
        return new NativeResponse('native', {
          status: 202,
          headers: { 'x-response': 'native', 'set-cookie': 'native=1' },
        });
      }

      @Get('/clone')
      clone() {
        const response = new Response('clone', {
          status: 203,
          headers: { 'x-response': 'clone' },
        });
        response.headers.append('set-cookie', 'clone=1');
        return response.clone();
      }
    }

    @Module({ controllers: [NativeController] })
    class NativeModule {}

    app = await createApplication(NativeModule);
    const origin = await listen();

    for (const [path, status] of [
      ['native', 202],
      ['clone', 203],
    ] as const) {
      const response = await fetch(`${origin}/${path}`);
      expect(response.status).toBe(status);
      expect(response.headers.get('x-response')).toBe(path);
      expect(response.headers.getSetCookie()).toEqual([`${path}=1`]);
      expect(await response.text()).toBe(path);
    }
  });

  it('keeps streamed responses independent across concurrent requests', async () => {
    @Controller()
    class StreamController {
      @Get('/:value')
      handle(context: Context) {
        context.status(206);
        return new ReadableStream({
          async start(controller) {
            await Promise.resolve();
            controller.enqueue(new TextEncoder().encode(context.req.param('value')));
            controller.close();
          },
        });
      }
    }

    @Module({ controllers: [StreamController] })
    class StreamModule {}

    app = await createApplication(StreamModule);
    app.useGlobalInterceptors({
      async intercept(_context, next) {
        const value = HttpContext.getValue('hono').req.param('value');
        const response = await next.handle();
        response.headers.set('x-value', value!);
        response.headers.append('set-cookie', `request=${value}`);
        await response.clone().text();
        return response;
      },
    });
    const origin = await listen();

    await Promise.all(
      ['first', 'second', 'third'].map(async (value) => {
        const response = await fetch(`${origin}/${value}`);
        expect(response.status).toBe(206);
        expect(response.headers.get('x-value')).toBe(value);
        expect(response.headers.getSetCookie()).toEqual([`request=${value}`]);
        expect(await response.text()).toBe(value);
      }),
    );
  });

  it('accepts clones when core is first loaded after the adapter starts', async () => {
    const origin = await listen();
    vi.resetModules();
    const { createApplication: createLateApplication } = await import('@tsuki-hono/core');
    const {
      Controller: LateController,
      Get: LateGet,
      Module: LateModule,
    } = await import('@tsuki-hono/common');

    @LateController()
    class CloneController {
      @LateGet('/')
      handle() {
        const response = new Response('late', { status: 202 });
        response.headers.append('set-cookie', 'late=1');
        return response.clone();
      }
    }

    @LateModule({ controllers: [CloneController] })
    class CloneModule {}

    app = await createLateApplication(CloneModule);
    const response = await fetch(origin);
    expect(response.status).toBe(202);
    expect(response.headers.getSetCookie()).toEqual(['late=1']);
    expect(await response.text()).toBe('late');
  });
});
