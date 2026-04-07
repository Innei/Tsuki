# Tsuki Framework - Development Guide

## Project Overview

Tsuki is a monorepo containing `@tsuki/framework` — a lightweight yet feature-complete enterprise web framework built on [Hono](https://hono.dev), providing NestJS-like modularity, decorators, and dependency injection while retaining Hono's performance and flexibility.

## Repository Structure

```
tsuki/
├── packages/
│   └── framework/          # @tsuki/framework - Core web framework
│       ├── src/
│       │   ├── application.ts          # HonoHttpApplication, createApplication()
│       │   ├── constants.ts            # Metadata symbols, APP_* tokens
│       │   ├── http-exception.ts       # HttpException and common exceptions
│       │   ├── index.ts                # Public API exports
│       │   ├── context/
│       │   │   └── http-context.ts     # AsyncLocalStorage request context
│       │   ├── decorators/
│       │   │   ├── apply-decorators.ts # Compose decorators
│       │   │   ├── controller.ts       # @Controller()
│       │   │   ├── enhancers.ts        # @UseGuards, @UsePipes, etc.
│       │   │   ├── http-methods.ts     # @Get, @Post, @Put, etc.
│       │   │   ├── middleware.ts        # @Middleware()
│       │   │   ├── module.ts           # @Module(), forwardRef()
│       │   │   ├── openapi.ts          # @ApiTags, @ApiDoc
│       │   │   └── params.ts           # @Body, @Query, @Param, etc.
│       │   ├── events/
│       │   │   └── index.ts            # @OnEvent, @EmitEvent, EventModule
│       │   ├── interfaces/
│       │   │   └── index.ts            # All type definitions
│       │   ├── logger/
│       │   │   └── logger.ts           # PrettyLogger
│       │   ├── openapi/
│       │   │   └── generator.ts        # OpenAPI 3.1 document generation
│       │   ├── pipes/
│       │   │   └── zod-validation.pipe.ts  # ZodValidationPipe, createZodDto
│       │   └── utils/
│       │       ├── container-ref.ts    # Global DI container reference
│       │       ├── execution-context.ts # ExecutionContext implementation
│       │       └── metadata.ts         # Metadata collection helpers
│       └── tests/                      # 121 tests, 100% coverage
├── package.json              # Monorepo root
└── pnpm-workspace.yaml       # Workspace config
```

## Tech Stack

- **Runtime**: Node.js with TypeScript (ESNext)
- **Package Manager**: pnpm 10.x with workspaces
- **HTTP**: Hono 4.x
- **DI**: tsyringe (reflect-metadata)
- **Validation**: Zod 4.x
- **Test**: Vitest with 100% coverage thresholds
- **Build**: SWC via unplugin-swc

## Development Commands

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run framework tests
cd packages/framework && pnpm test

# Run tests with coverage
cd packages/framework && pnpm test:coverage

# Watch mode
cd packages/framework && pnpm test:watch
```

## Key Architecture Concepts

### Request Execution Flow

```
Request → HttpContext.run() → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post) → Exception Filters (on error) → Response
```

### Core Dependencies

| Package            | Role                              |
| ------------------ | --------------------------------- |
| `hono`             | HTTP routing and request handling |
| `tsyringe`         | Dependency injection container    |
| `reflect-metadata` | Decorator metadata reflection     |
| `zod`              | Schema validation                 |
| `picocolors`       | Colored log output                |
| `ioredis` (peer)   | Redis pub/sub for event system    |

### Decorator-Driven Design

Everything is declared via decorators:

- `@Module({ imports, controllers, providers })` — organize features
- `@Controller(prefix)` — HTTP endpoint groups
- `@Get()`, `@Post()`, etc. — route handlers
- `@Body()`, `@Query()`, `@Param()` — parameter injection
- `@UseGuards()`, `@UsePipes()`, `@UseInterceptors()`, `@UseFilters()` — enhancers
- `@Middleware({ path, priority })` — HTTP middleware

### Dependency Injection

- Container is based on `tsyringe` with strict mode (unregistered tokens throw `ReferenceError`)
- Providers default to singleton
- Support for `useClass`, `useValue`, `useExisting`, `useFactory`
- Global enhancers via `APP_GUARD`, `APP_PIPE`, `APP_INTERCEPTOR`, `APP_FILTER`, `APP_MIDDLEWARE` tokens
- Classes in enhancer decorators are auto-registered as singletons on first use

### Important Rules

1. **Always use value imports, not type imports** for DI — `import { Service }` not `import type { Service }`
2. **`reflect-metadata` must be imported first** before any decorator usage
3. **`emitDecoratorMetadata` and `experimentalDecorators`** must be enabled in tsconfig
4. **Controllers must have `@Controller()` decorator** and services must have `@injectable()`
5. **Return plain objects** from handlers — framework handles Response serialization
6. **HttpContext is request-scoped** — only available within request handlers, not in startup code

## Testing Guidelines

- Tests use Vitest with SWC for fast compilation
- Coverage thresholds: 100% statements, branches, functions, lines (excluding OpenAPI generator)
- `vitest.setup.ts` imports `reflect-metadata` globally
- Use `createApplication(Module)` for integration tests
- Use `app.getInstance().request(path)` to test routes
- Clean up with `await app.close()` in afterEach

## Code Style

- TypeScript strict mode
- ESNext target with ESModule resolution
- No semicolons or trailing commas enforcement — follow existing patterns
- Prefer `async/await` over raw Promises
- Use `interface` for contracts, `type` for unions/intersections
