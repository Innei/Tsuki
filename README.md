<div align="center">

# 🌙 Tsuki

A collection of TypeScript libraries for building enterprise-grade server applications.

</div>

## Why “Tsuki”

**Hono** (_hi_, **火**, fire; the framework’s name plays on **炎**, _flame_) and **Tsuki** (_tsuki_, **月**, moon) mirror each other: **火 ↔ 月** — a fast, fiery edge runtime with a calm, reflective layer on top. [Hono](https://hono.dev) stays lean at HTTP; Tsuki adds modules, decorators, and DI without dulling that core.

## Inspired by NestJS

Tsuki borrows proven ideas from the [NestJS](https://nestjs.com) ecosystem so teams can reuse familiar mental models without committing to a full Nest stack on Hono:

- **Modules & controllers** — `@Module`, `@Controller`, and route decorators for structure and discovery.
- **Dependency injection** — constructor injection via [tsyringe](https://github.com/microsoft/tsyringe), with singleton providers and explicit registration.
- **Cross-cutting concerns** — guards, pipes, interceptors, exception filters, and middleware hooks arranged in a predictable request pipeline.
- **Metadata-driven behavior** — decorators carry OpenAPI and routing hints, similar to Nest’s decorator-first configuration style.

NestJS remains the reference for many of these patterns; Tsuki adapts them for Hono-first apps that want the same ergonomics in a smaller footprint.

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
