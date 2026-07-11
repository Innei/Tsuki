# @tsuki-hono/core

Application runtime for the Tsuki framework — bootstraps modules, registers routes, manages DI container and lifecycle hooks.

## Install

```bash
pnpm add @tsuki-hono/core
```

## Quick Start

```ts
import 'reflect-metadata';
import { serve } from '@hono/node-server';
import { Module, Controller, Get } from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';

@Controller('hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello!' };
  }
}

@Module({ controllers: [HelloController] })
class AppModule {}

const app = await createApplication(AppModule, { globalPrefix: '/api' });
serve({ fetch: app.getInstance().fetch, port: 3000 });
```

## API

### `createApplication(rootModule, options?, hono?)`

Bootstraps the application — registers all modules, providers, and controllers, then returns an `HonoHttpApplication` instance.

```ts
const app = await createApplication(AppModule, {
  globalPrefix: '/api', // optional route prefix
  logger: customLogger, // optional PrettyLogger instance
});
```

### `HonoHttpApplication`

| Method                                   | Description                                          |
| ---------------------------------------- | ---------------------------------------------------- |
| `getInstance()`                          | Returns the underlying Hono instance                 |
| `getContainer()`                         | Returns the DI container                             |
| `getInitialized()`                       | Whether `init()` has completed                       |
| `useGlobalGuards(...guards)`             | Register global guards (instances)                   |
| `useGlobalPipes(...pipes)`               | Register global pipes (instances)                    |
| `useGlobalInterceptors(...interceptors)` | Register global interceptors (instances)             |
| `useGlobalFilters(...filters)`           | Register global exception filters (instances)        |
| `useGlobalMiddlewares(...middlewares)`   | Register global middlewares (MiddlewareDefinition[]) |
| `close(signal?)`                         | Graceful shutdown — triggers lifecycle hooks         |

### `ContainerRef`

Global DI container reference — useful for accessing the container outside of DI-managed code (decorators, utilities).

```ts
import { ContainerRef } from '@tsuki-hono/core';

// Set during bootstrap (automatic)
ContainerRef.set(container);

// Read from anywhere
const container = ContainerRef.get();
const service = container.resolve(MyService);

// Temporarily override (tests)
await ContainerRef.runWith(testContainer, async () => {
  // ...
});
```

### Request Execution Flow

```
Request
  └─ HttpContext.run()
       ├─ Guards (global → controller → method)
       ├─ Interceptors (pre)
       ├─ Parameter resolution + Pipes
       ├─ Controller handler
       ├─ Interceptors (post)
       ├─ Exception Filters (on error)
       └─ Response
```

### Lifecycle Hooks

Providers implementing these interfaces have their hooks called automatically:

1. `onModuleInit()` — after module registration
2. `onApplicationBootstrap()` — after all modules initialized
3. `beforeApplicationShutdown(signal?)` — on `app.close()`
4. `onModuleDestroy()` — teardown
5. `onApplicationShutdown(signal?)` — final step

Lifecycle hooks apply only to providers canonically owned by the final
`Module.providers` registration for a token. This includes constructor providers,
values, aliases to module-owned singletons, and singleton `useClass`/`useFactory`
providers. Singleton factories are materialized during application initialization
so their hooks can be discovered. If a token is registered more than once across
imports and the root module, only its final registration participates in lifecycle.

Transient providers do not have an application lifecycle because they do not have
one canonical instance. Registrations supplied only through
`ApplicationOptions.container` are externally owned: Tsuki can resolve and use them
for dependency injection or APP enhancers, but it does not invoke their lifecycle
hooks. The caller that supplied the container remains responsible for their setup
and teardown.

## License

MIT
