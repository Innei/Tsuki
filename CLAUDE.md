# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tsuki is a monorepo of TypeScript libraries for building enterprise web applications on [Hono](https://hono.dev), with NestJS-like decorators and dependency injection via tsyringe.

## Packages

| Package                     | Description                                                                 | Dependencies                                                        |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `@tsuki-hono/common`        | Decorators, interfaces, exceptions, pipes, logger, HTTP context             | tsyringe, reflect-metadata, zod                                     |
| `@tsuki-hono/core`          | Application runtime (`createApplication`), DI container, route registration | depends on `@tsuki-hono/common`, hono                               |
| `@tsuki-hono/event-emitter` | Redis pub/sub event system (`@OnEvent`, `@EmitEvent`, `EventModule`)        | depends on `@tsuki-hono/common` + `@tsuki-hono/core`, peer: ioredis |
| `@tsuki-hono/openapi`       | OpenAPI 3.1 doc generation from decorator metadata                          | depends on `@tsuki-hono/common`, zod                                |

Dependency graph: `common` ← `core` ← `event-emitter`; `common` ← `openapi`.

## Development Commands

```bash
pnpm install   # Install all dependencies
pnpm test      # Run all tests across packages
pnpm build     # Build all packages (tsdown)
pnpm typecheck # Typecheck all packages

# Per-package
cd packages/core && pnpm test       # Run tests for one package
cd packages/core && pnpm test:watch # Watch mode
npx vitest run tests/foo.test.ts    # Run a single test file (from package dir)

# Linting
pnpm lint   # ESLint with auto-fix (lobehub config)
pnpm format # Prettier
```

Pre-commit hook runs lint-staged (eslint + prettier on changed files) via simple-git-hooks.

## Architecture

### Request Execution Flow

```
Request → HttpContext.run() → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post) → Exception Filters (on error) → Response
```

### Key Patterns

- **Decorator-driven**: `@Module`, `@Controller`, `@Get`/`@Post`/etc., `@Body`/`@Query`/`@Param`, `@UseGuards`/`@UsePipes`/`@UseInterceptors`/`@UseFilters`, `@Middleware`
- **DI via tsyringe**: singleton by default, strict mode (unregistered tokens throw `ReferenceError`). Providers support `useClass`, `useValue`, `useExisting`, `useFactory`
- **Global enhancers**: `APP_GUARD`, `APP_PIPE`, `APP_INTERCEPTOR`, `APP_FILTER`, `APP_MIDDLEWARE` tokens
- **HttpContext**: AsyncLocalStorage-based, request-scoped only — not available at startup

### Critical Rules

1. **Value imports for DI** — `import { Service }` not `import type { Service }` (tsyringe needs the runtime reference)
2. **`reflect-metadata` imported first** — `@tsuki-hono/common/src/index.ts` handles this; ensure it's loaded before decorators
3. **`emitDecoratorMetadata` + `experimentalDecorators`** must be enabled in tsconfig
4. **Controllers need `@Controller()`**, services need `@injectable()`
5. **Return plain objects** from handlers — framework serializes to Response

## Testing

- Vitest + SWC (via unplugin-swc), `maxConcurrency: 1` per config
- `vitest.setup.ts` in each package imports `reflect-metadata`
- Integration tests: `createApplication(Module)` → `app.getInstance().request(path)` → assert response
- Clean up: `await app.close()` in afterEach
- `@tsuki-hono/openapi` has no tests currently

## Tech Stack

- **Runtime**: Node.js, TypeScript 6.x (ESNext/ESModule)
- **Package Manager**: pnpm 10.x with workspaces
- **Build**: tsdown
- **HTTP**: Hono 4.x
- **DI**: tsyringe + reflect-metadata
- **Validation**: Zod 4.x
- **Lint**: ESLint (lobehub config) + Prettier (lobehub config)
