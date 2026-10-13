import 'reflect-metadata';

import { APP_GUARD, Body, Controller, Get, Module, Post } from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';
import { describe, expect, it, vi } from 'vitest';

describe('Request security boundaries', () => {
  it.each([undefined, null, false, {}, { canActivate: 'yes' }])(
    'rejects an invalid global guard before serving requests: %j',
    async (guard) => {
      @Module({ providers: [{ provide: APP_GUARD, useFactory: () => guard }] })
      class GuardModule {}

      await expect(createApplication(GuardModule)).rejects.toThrow(/Invalid guard configuration/);
    },
  );

  it.each([false, undefined, null, 1, 'yes', {}])(
    'does not authorize a request unless the guard returns true: %j',
    async (result) => {
      const handler = vi.fn(() => ({ private: 'data' }));

      @Controller('private')
      class PrivateController {
        @Get('/')
        read() {
          return handler();
        }
      }

      @Module({
        controllers: [PrivateController],
        providers: [{ provide: APP_GUARD, useValue: { canActivate: () => result } }],
      })
      class GuardModule {}

      const app = await createApplication(GuardModule);
      try {
        const response = await app.getInstance().request('/private');
        expect(response.status).toBe(403);
        expect(handler).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it('parses JSON only for an exact JSON media type', async () => {
    const mutate = vi.fn();

    @Controller('mutation')
    class MutationController {
      @Post('/')
      write(@Body() body: unknown) {
        if (body !== null) mutate(body);
        return { body };
      }
    }

    @Module({ controllers: [MutationController] })
    class BodyModule {}

    const app = await createApplication(BodyModule);
    try {
      for (const contentType of [
        'text/plain; application/json',
        'text/plain; type=application/json',
        'application/jsonp',
        'application/x-www-form-urlencoded; application/json',
      ]) {
        const response = await app.getInstance().request('/mutation', {
          method: 'POST',
          headers: { 'content-type': contentType },
          body: '{"role":"admin"}',
        });
        expect(await response.json()).toEqual({ body: null });
      }
      expect(mutate).not.toHaveBeenCalled();

      const response = await app.getInstance().request('/mutation', {
        method: 'POST',
        headers: { 'content-type': 'Application/JSON; charset=utf-8' },
        body: '{"role":"reader"}',
      });
      expect(await response.json()).toEqual({ body: { role: 'reader' } });
      expect(mutate).toHaveBeenCalledExactlyOnceWith({ role: 'reader' });
    } finally {
      await app.close();
    }
  });
});
