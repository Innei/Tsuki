import type {
  ArgumentMetadata,
  CallHandler,
  CanActivate,
  ExecutionContext,
  Interceptor,
  PipeTransform,
  RouteParamMetadataItem,
} from '@tsuki-hono/common';
import {
  Controller,
  Get,
  HttpContext,
  Module,
  Query,
  ROUTE_ARGS_METADATA,
  RouteParamtypes,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';
import { Context } from 'hono';
import { injectable } from 'tsyringe';
import { describe, expect, it } from 'vitest';

describe('request pipeline', () => {
  it('preserves response status, headers, cookies, async values, and method receivers', async () => {
    @Controller('responses')
    class ResponsesController {
      private readonly value = 'bound';

      @Get('/json')
      json(context: Context) {
        context.status(201);
        context.header('x-custom', 'json');
        context.header('set-cookie', 'first=1', { append: true });
        context.header('set-cookie', 'second=2', { append: true });
        return { value: this.value };
      }

      @Get('/text')
      async text(context: Context) {
        context.status(202);
        context.header('x-custom', 'text');
        context.header('set-cookie', 'text=1');
        await Promise.resolve();
        return this.value;
      }

      @Get('/bytes')
      bytes(context: Context) {
        context.status(203);
        context.header('x-custom', 'bytes');
        return new TextEncoder().encode(this.value);
      }

      @Get('/stream')
      stream(context: Context) {
        context.status(206);
        context.header('x-custom', 'stream');
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('stream'));
            controller.close();
          },
        });
      }

      @Get('/void')
      empty(context: Context) {
        context.res = context.body(null, 204, { 'x-custom': 'void' });
      }

      @Get('/explicit')
      explicit() {
        return new Response(this.value, {
          status: 207,
          headers: { 'x-custom': 'explicit', 'set-cookie': 'explicit=1' },
        });
      }
    }

    @Module({ controllers: [ResponsesController] })
    class ResponsesModule {}

    const app = await createApplication(ResponsesModule);
    try {
      const json = await app.getInstance().request('/responses/json');
      expect(json.status).toBe(201);
      expect(json.headers.get('x-custom')).toBe('json');
      expect(json.headers.getSetCookie()).toEqual(['first=1', 'second=2']);
      expect(await json.json()).toEqual({ value: 'bound' });

      for (const [path, status, value] of [
        ['text', 202, 'bound'],
        ['bytes', 203, 'bound'],
        ['stream', 206, 'stream'],
        ['void', 204, ''],
        ['explicit', 207, 'bound'],
      ] as const) {
        const response = await app.getInstance().request(`/responses/${path}`);
        expect(response.status).toBe(status);
        expect(response.headers.get('x-custom')).toBe(path);
        expect(await response.text()).toBe(value);
        if (path === 'text' || path === 'explicit') {
          expect(response.headers.getSetCookie()).toEqual([`${path}=1`]);
        }
      }
    } finally {
      await app.close();
    }
  });

  it('applies globals added after the first request and preserves interceptor ordering', async () => {
    const calls: string[] = [];

    @Controller('late')
    class LateController {
      @Get('/')
      handle(@Query('value') value: string) {
        calls.push('handler');
        return value;
      }

      @Get('/error')
      error() {
        throw new Error('handled');
      }
    }

    @Module({ controllers: [LateController] })
    class LateModule {}

    const app = await createApplication(LateModule);
    try {
      expect(await (await app.getInstance().request('/late?value=first')).text()).toBe('first');
      calls.length = 0;
      app.useGlobalGuards({
        canActivate(context) {
          calls.push('guard');
          return context.getContext().hono.req.header('x-allow') === 'yes';
        },
      });
      app.useGlobalPipes({
        transform(value) {
          calls.push('pipe');
          return `${value}-piped`;
        },
      });
      app.useGlobalInterceptors({
        async intercept(_context, next) {
          calls.push('interceptor-before');
          const response = await next.handle();
          expect(response).toBeInstanceOf(Response);
          expect(Reflect.get(response, Symbol.for('hono.framework.generatedResponse'))).toBe(true);
          calls.push('interceptor-after');
          response.headers.set('x-intercepted', 'yes');
          return response;
        },
      });
      const response = await app.getInstance().request('/late?value=second', {
        headers: { 'x-allow': 'yes' },
      });
      expect(await response.text()).toBe('second-piped');
      expect(response.headers.get('x-intercepted')).toBe('yes');
      expect(calls).toEqual([
        'guard',
        'interceptor-before',
        'pipe',
        'handler',
        'interceptor-after',
      ]);
      expect((await app.getInstance().request('/late?value=blocked')).status).toBe(403);

      app.useGlobalFilters({
        catch(error) {
          return new Response(error.message, { status: 418 });
        },
      });
      const failure = await app.getInstance().request('/late/error', {
        headers: { 'x-allow': 'yes' },
      });
      expect(failure.status).toBe(418);
      expect(await failure.text()).toBe('handled');
    } finally {
      await app.close();
    }
  });

  it('resolves decorated transient enhancers for each request without eager construction', async () => {
    const guards: object[] = [];
    const handlerPipes: object[] = [];
    const parameterPipes: object[] = [];
    const interceptors: object[] = [];
    const filters: object[] = [];
    const singletons: object[] = [];
    let constructions = 0;

    @injectable()
    class TransientGuard implements CanActivate {
      constructor() {
        constructions += 1;
      }
      canActivate() {
        guards.push(this);
        return true;
      }
    }

    @injectable()
    class SingletonGuard implements CanActivate {
      canActivate() {
        singletons.push(this);
        return true;
      }
    }

    @injectable()
    class HandlerPipe implements PipeTransform {
      transform(value: unknown) {
        handlerPipes.push(this);
        return `${value}-handler`;
      }
    }

    @injectable()
    class ParameterPipe implements PipeTransform {
      transform(value: unknown) {
        parameterPipes.push(this);
        return `${value}-parameter`;
      }
    }

    @injectable()
    class TransientInterceptor implements Interceptor {
      intercept(_context: ExecutionContext, next: CallHandler) {
        interceptors.push(this);
        return next.handle();
      }
    }

    @injectable()
    class TransientFilter {
      catch(error: Error) {
        filters.push(this);
        return new Response(error.message, { status: 409 });
      }
    }

    @Controller('transient')
    @UseGuards(SingletonGuard, TransientGuard)
    @UseInterceptors(TransientInterceptor)
    class TransientController {
      @Get('/')
      @UsePipes(HandlerPipe)
      handle(@Query('value', ParameterPipe) value: string) {
        return value;
      }

      @Get('/error')
      @UseFilters(TransientFilter)
      error() {
        throw new Error('failure');
      }
    }

    @Module({
      controllers: [TransientController],
      providers: [
        { provide: TransientGuard, useClass: TransientGuard, singleton: false },
        { provide: HandlerPipe, useClass: HandlerPipe, singleton: false },
        { provide: ParameterPipe, useClass: ParameterPipe, singleton: false },
        { provide: TransientInterceptor, useClass: TransientInterceptor, singleton: false },
        { provide: TransientFilter, useClass: TransientFilter, singleton: false },
      ],
    })
    class TransientModule {}

    const app = await createApplication(TransientModule);
    try {
      expect(constructions).toBe(0);
      for (let index = 0; index < 2; index += 1) {
        const response = await app.getInstance().request('/transient?value=test');
        expect(await response.text()).toBe('test-handler-parameter');
      }
      for (const instances of [guards, handlerPipes, parameterPipes, interceptors]) {
        expect(instances).toHaveLength(2);
        expect(instances[0]).not.toBe(instances[1]);
      }
      expect(singletons[0]).toBe(singletons[1]);
      expect(constructions).toBe(2);
      for (let index = 0; index < 2; index += 1) {
        const response = await app.getInstance().request('/transient/error');
        expect(response.status).toBe(409);
        expect(await response.text()).toBe('failure');
      }
      expect(filters).toHaveLength(2);
      expect(filters[0]).not.toBe(filters[1]);
    } finally {
      await app.close();
    }
  });

  it('retains inferred context metatypes, sparse arguments, and async custom factories', async () => {
    @Controller('arguments')
    class ArgumentsController {
      @Get('/context')
      context(first: Context, second: Context) {
        expect(first).toBe(second);
        return { path: first.req.path };
      }

      @Get('/sparse')
      sparse(...args: unknown[]) {
        expect(args).toHaveLength(5);
        expect(args[0]).toBeUndefined();
        expect(args[1]).toBeUndefined();
        expect(args[3]).toBeUndefined();
        return { query: args[2], factory: args[4] };
      }
    }
    Reflect.deleteMetadata('design:paramtypes', ArgumentsController.prototype, 'context');
    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      [
        { index: 2, type: RouteParamtypes.QUERY, data: 'value' },
        {
          index: 4,
          type: RouteParamtypes.CUSTOM,
          factory: async (_context, host) => {
            const executionContext = host as ExecutionContext;
            await Promise.resolve();
            expect(executionContext.getClass()).toBe(ArgumentsController);
            expect(executionContext.getHandler()).toBe(ArgumentsController.prototype.sparse);
            return 'factory-value';
          },
        },
      ] satisfies RouteParamMetadataItem[],
      ArgumentsController.prototype,
      'sparse',
    );

    @Module({ controllers: [ArgumentsController] })
    class ArgumentsModule {}

    const app = await createApplication(ArgumentsModule);
    try {
      app.useGlobalPipes({
        transform(value, metadata: ArgumentMetadata) {
          if (metadata.type === 'context') {
            expect(metadata.metatype).toBe(HttpContext.get().hono.constructor);
          }
          return value;
        },
      });
      const context = await app.getInstance().request('/arguments/context');
      expect(await context.json()).toEqual({ path: '/arguments/context' });
      const sparse = await app.getInstance().request('/arguments/sparse?value=query-value');
      expect(await sparse.json()).toEqual({ query: 'query-value', factory: 'factory-value' });
    } finally {
      await app.close();
    }
  });

  it('invokes handlers replaced during bootstrap with their current argument signature', async () => {
    @Controller('replacement')
    class ReplacementController {
      private readonly value = 'replacement';
      @Get('/')
      handle() {
        return 'original';
      }
      onApplicationBootstrap() {
        Reflect.set(this, 'handle', function (this: ReplacementController, context: Context) {
          return { value: this.value, path: context.req.path };
        });
      }
    }

    @Module({ controllers: [ReplacementController] })
    class ReplacementModule {}

    const app = await createApplication(ReplacementModule);
    try {
      const response = await app.getInstance().request('/replacement');
      expect(await response.json()).toEqual({ value: 'replacement', path: '/replacement' });
    } finally {
      await app.close();
    }
  });

  it('keeps each pending request paired with its captured handler argument signature', async () => {
    let release!: () => void;
    let entered!: () => void;
    const guardEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const guardReleased = new Promise<void>((resolve) => {
      release = resolve;
    });

    @Controller('concurrent-handler')
    class ConcurrentController {
      @Get('/')
      handle(...args: unknown[]) {
        return { empty: args[0] === undefined, value: args[2] };
      }
    }
    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      [{ index: 2, type: RouteParamtypes.QUERY, data: 'value' }],
      ConcurrentController.prototype,
      'handle',
    );

    @Module({ controllers: [ConcurrentController] })
    class ConcurrentModule {}

    const app = await createApplication(ConcurrentModule);
    let firstRequest = true;
    app.useGlobalGuards({
      async canActivate() {
        if (firstRequest) {
          firstRequest = false;
          entered();
          await guardReleased;
        }
        return true;
      },
    });
    try {
      const original = app.getInstance().request('/concurrent-handler?value=original');
      await guardEntered;
      Reflect.set(
        app.getContainer().resolve(ConcurrentController),
        'handle',
        function (context: Context) {
          return { path: context.req.path };
        },
      );
      const replacement = await app.getInstance().request('/concurrent-handler?value=replaced');
      expect(await replacement.json()).toEqual({ path: '/concurrent-handler' });
      release();
      expect(await (await original).json()).toEqual({ empty: true, value: 'original' });
    } finally {
      release();
      await app.close();
    }
  });

  it('uses the current HttpContext response context after guards', async () => {
    @Controller('response-context')
    class ResponseContextController {
      @Get('/')
      async handle(context: Context) {
        await Promise.resolve();
        expect(HttpContext.get().hono.req.path).toBe('/alternate');
        return { path: context.req.path };
      }
    }

    @Module({ controllers: [ResponseContextController] })
    class ResponseContextModule {}

    const app = await createApplication(ResponseContextModule);
    app.useGlobalGuards({
      canActivate() {
        const replacement = new Context(new Request('http://localhost/alternate'), {
          env: {},
          path: '/alternate',
        });
        replacement.status(202);
        replacement.header('x-context', 'replacement');
        HttpContext.setContext(replacement);
        return true;
      },
    });
    try {
      for (let index = 0; index < 2; index += 1) {
        const response = await app.getInstance().request('/response-context');
        expect(response.status).toBe(202);
        expect(response.headers.get('x-context')).toBe('replacement');
        expect(await response.json()).toEqual({ path: '/response-context' });
        app.useGlobalInterceptors({ intercept: (_context, next) => next.handle() });
      }
    } finally {
      await app.close();
    }
  });
});
