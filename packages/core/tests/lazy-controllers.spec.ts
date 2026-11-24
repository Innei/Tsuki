import type { ArgumentMetadata, CanActivate, PipeTransform } from '@tsuki-hono/common';
import {
  Controller,
  Get,
  HttpContext,
  Module,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';
import { inject, injectable } from 'tsyringe';
import { describe, expect, it } from 'vitest';

describe('lazy controllers', () => {
  it('constructs a controller on the first request to its routes, once', async () => {
    const constructed: unknown[] = [];

    @injectable()
    class GreetingService {
      greet(name: string) {
        return `hello ${name}`;
      }
    }

    @Controller('lazy')
    class LazyController {
      constructor(private readonly greetings: GreetingService) {
        constructed.push(this);
      }

      @Get('/a')
      a() {
        return this.greetings.greet('a');
      }

      @Get('/b')
      b() {
        return this.greetings.greet('b');
      }
    }

    @Module({ controllers: [LazyController], providers: [GreetingService] })
    class LazyModule {}

    const app = await createApplication(LazyModule, { lazyControllers: true });
    try {
      expect(constructed).toHaveLength(0);

      expect(await (await app.getInstance().request('/lazy/a')).text()).toBe('hello a');
      expect(await (await app.getInstance().request('/lazy/b')).text()).toBe('hello b');
      expect(await (await app.getInstance().request('/lazy/a')).text()).toBe('hello a');

      expect(constructed).toHaveLength(1);
      expect(app.getContainer().resolve(LazyController)).toBe(constructed[0]);
    } finally {
      await app.close();
    }
  });

  it('keeps constructing controllers with lifecycle hooks during init', async () => {
    const calls: string[] = [];

    @Controller('eager')
    class EagerController {
      constructor() {
        calls.push('construct');
      }

      onModuleInit() {
        calls.push('init');
      }

      @Get('/')
      handle() {
        return 'eager';
      }
    }

    @Module({ controllers: [EagerController] })
    class EagerModule {}

    const app = await createApplication(EagerModule, { lazyControllers: true });
    try {
      expect(calls).toEqual(['construct', 'init']);
      expect(await (await app.getInstance().request('/eager')).text()).toBe('eager');
      expect(calls).toEqual(['construct', 'init']);
    } finally {
      await app.close();
    }
  });

  it('applies params, pipes and guards on a lazily constructed controller', async () => {
    let constructions = 0;

    @injectable()
    class TokenGuard implements CanActivate {
      canActivate() {
        return HttpContext.getValue('hono').req.header('x-token') === 'ok';
      }
    }

    @injectable()
    class UppercasePipe implements PipeTransform<unknown, unknown> {
      transform(value: unknown, metadata: ArgumentMetadata) {
        return metadata.type === 'param' && typeof value === 'string' ? value.toUpperCase() : value;
      }
    }

    @Controller('guarded')
    @UseGuards(TokenGuard)
    class GuardedController {
      constructor() {
        constructions += 1;
      }

      @Get('/:id')
      @UsePipes(UppercasePipe)
      read(@Param('id') id: string, @Query('suffix') suffix: string) {
        return { id, suffix };
      }
    }

    @Module({ controllers: [GuardedController] })
    class GuardedModule {}

    const app = await createApplication(GuardedModule, { lazyControllers: true });
    try {
      expect(constructions).toBe(0);

      const denied = await app.getInstance().request('/guarded/abc?suffix=x');
      expect(denied.status).toBe(403);

      const allowed = await app.getInstance().request('/guarded/abc?suffix=x', {
        headers: { 'x-token': 'ok' },
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({ id: 'ABC', suffix: 'x' });
      expect(constructions).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('still rejects at init when a transitive dependency is not provided', async () => {
    let constructions = 0;

    @injectable()
    class UnprovidedService {}

    @injectable()
    class ProvidedService {
      constructor(private readonly inner: UnprovidedService) {}
    }

    @Controller('transitive')
    class TransitiveController {
      constructor(private readonly service: ProvidedService) {
        constructions += 1;
      }

      @Get('/')
      handle() {
        return 'never';
      }
    }

    @Module({ controllers: [TransitiveController], providers: [ProvidedService] })
    class TransitiveModule {}

    await expect(createApplication(TransitiveModule, { lazyControllers: true })).rejects.toThrow(
      /UnprovidedService/,
    );
    expect(constructions).toBe(0);
  });

  it('still rejects at init when a controller dependency token is not registered', async () => {
    @Controller('missing-token')
    class MissingTokenController {
      constructor(@inject('MISSING_TOKEN') private readonly value: string) {}

      @Get('/')
      handle() {
        return this.value;
      }
    }

    @Module({ controllers: [MissingTokenController] })
    class MissingTokenModule {}

    await expect(createApplication(MissingTokenModule, { lazyControllers: true })).rejects.toThrow(
      /Failed to resolve provider MissingTokenController/,
    );
  });

  it('builds controllers during init unless lazy controllers are enabled', async () => {
    const constructed: unknown[] = [];

    @Controller('eager-default')
    class DefaultController {
      constructor() {
        constructed.push(this);
      }

      @Get('/')
      index() {
        return 'ok';
      }
    }

    @Module({ controllers: [DefaultController] })
    class DefaultModule {}

    const app = await createApplication(DefaultModule);
    try {
      expect(constructed).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
