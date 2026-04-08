<div align="center">

# Tsuki

A collection of TypeScript libraries for building enterprise-grade server applications.

</div>

## Packages

| Package                                                 | Description                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`@tsuki-hono/common`](./packages/common)               | Decorators, interfaces, exceptions, pipes, logger, and request context |
| [`@tsuki-hono/core`](./packages/core)                   | Application runtime, DI container utils, route registration            |
| [`@tsuki-hono/event-emitter`](./packages/event-emitter) | Redis pub/sub event system with `@OnEvent` / `@EmitEvent`              |
| [`@tsuki-hono/openapi`](./packages/openapi)             | OpenAPI 3.1 document generation from decorator metadata                |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/innei/tsuki.git
cd tsuki

# Install dependencies
pnpm install

# Run tests
pnpm test
```

## Usage

```ts
import 'reflect-metadata';
import { serve } from '@hono/node-server';
import { Module, Controller, Get } from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';

@Controller('hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Tsuki!' };
  }
}

@Module({ controllers: [HelloController] })
class AppModule {}

async function bootstrap() {
  const app = await createApplication(AppModule);
  serve({ fetch: app.getInstance().fetch, port: 3000 });
}

bootstrap();
```

See individual package READMEs for detailed documentation.

## Development

- **Package Manager**: pnpm 10.x
- **Language**: TypeScript (ESNext)
- **Test**: Vitest

```bash
pnpm install # Install all dependencies
pnpm test    # Run all tests across packages
```

## License

MIT
