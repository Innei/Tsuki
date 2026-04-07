# @tsuki/core

Application runtime for the Tsuki framework — bootstraps modules, registers routes, manages DI container and lifecycle hooks.

## Install

```bash
pnpm add @tsuki/core
```

## Quick Start

```ts
import 'reflect-metadata';
import { serve } from '@hono/node-server';
import { Module, Controller, Get } from '@tsuki/common';
import { createApplication } from '@tsuki/core';

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
import { ContainerRef } from '@tsuki/core';

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

## License

MIT
