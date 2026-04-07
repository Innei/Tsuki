<div align="center">

# Tsuki

A collection of TypeScript libraries for building enterprise-grade server applications.

</div>

## Packages

| Package                                    | Description                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@tsuki/framework`](./packages/framework) | A NestJS-inspired web framework built on Hono with DI, decorators, guards, pipes, interceptors, filters, middleware, events, and OpenAPI support |

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
import { Module, Controller, Get, createApplication } from '@tsuki/framework';

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

See the [framework README](./packages/framework/README.md) for full documentation.

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
