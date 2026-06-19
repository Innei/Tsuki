# @tsuki-hono/starter

Reference starter for building applications with the Tsuki framework. Showcases each of the four packages with a small, isolated example.

## What you get

- **`@tsuki-hono/common`** — `@Module`, `@Controller`, decorators, `createZodDto`, global pipes
- **`@tsuki-hono/core`** — `createApplication`, DI container, global filter/interceptor wiring
- **`@tsuki-hono/openapi`** — auto-generated OpenAPI 3.1 document + Scalar UI
- **`@tsuki-hono/event-emitter`** — Redis pub/sub event bus with `@EmitEvent` and `@OnEvent`

Plus production-shaped scaffolding:

- postgres + drizzle, ioredis with health-checked providers
- vite-SSR build (`dist/main.mjs` + `dist/migrate.mjs`), vite-node dev loop, env validation via zod
- Typed `AppException` + error-code table → `{ error: { code, message, details? } }` envelope
- `ResponseInterceptor` → success envelope `{ data, meta? }`; `@ResponsePassthrough()` to opt out
- CLI pipeline placeholder, `docker-compose.yml` for local infra, `Dockerfile` + `docker-compose.prod.yml` for production with release-phase migrations (advisory-locked).

> Scaffold a fresh copy with `pnpm create tsuki-app my-app` instead of cloning the monorepo.

## Quickstart

```bash
# 1. install deps (from the repo root in a workspace, or inside the copied directory)
pnpm install

# 2. start postgres + redis
docker compose up -d

# 3. copy env template
cp .env.example .env

# 4. generate + run drizzle migrations
pnpm db:generate
pnpm db:migrate

# 5. start the dev server (vite-node + nodemon)
pnpm dev
```

The server listens on `http://localhost:3000`. The `/api` prefix is applied to all controllers.

- OpenAPI JSON: `http://localhost:3000/internal/openapi.json`
- Scalar docs UI: `http://localhost:3000/internal/docs`

## Environment

| Variable       | Required | Default                  | Notes                                   |
| -------------- | -------- | ------------------------ | --------------------------------------- |
| `NODE_ENV`     | no       | `development`            | `development` \| `production` \| `test` |
| `HOSTNAME`     | no       | `0.0.0.0`                | HTTP bind host                          |
| `PORT`         | no       | `3000`                   | HTTP port                               |
| `DATABASE_URL` | yes      | —                        | Postgres connection string              |
| `REDIS_URL`    | no       | `redis://127.0.0.1:6379` | Redis connection string                 |

Invalid environments fail fast at startup with a list of issues.

## Demo endpoints

Each module is a focused example of one capability — feel free to delete the ones you don't need.

### Hello (zod validation)

```bash
curl 'http://localhost:3000/api/hello?name=Tsuki'
curl -X POST http://localhost:3000/api/hello \
  -H 'content-type: application/json' \
  -d '{"name":"Tsuki","excited":true}'
```

### Posts (database)

```bash
curl http://localhost:3000/api/posts
curl -X POST http://localhost:3000/api/posts \
  -H 'content-type: application/json' \
  -d '{"title":"Hello","content":"My first post"}'
curl http://localhost:3000/api/posts/1
```

Creating a post triggers a `post.created` event; the listener increments `stats:posts_created` in Redis.

### Cache (Redis)

```bash
curl -X PUT http://localhost:3000/api/cache/greeting \
  -H 'content-type: application/json' \
  -d '{"value":"hi","ttlSeconds":60}'
curl http://localhost:3000/api/cache/greeting
```

### Events (event-emitter)

```bash
curl -X POST http://localhost:3000/api/events/ping
curl -X POST http://localhost:3000/api/events/stats
```

## Response envelope

Every HTTP response is a discriminated envelope: `{ data, meta? }` on success or `{ error: { code, message, details? } }` on failure. The status code is preserved on the HTTP layer; the body always has one of these two shapes.

### Success

`ResponseInterceptor` wraps every controller return value into `{ data }`. Return a plain object — no need to construct the envelope yourself:

```ts
@Get('/')
me() {
  return { id: 1, name: 'Tsuki' }
}
// → 200  { "data": { "id": 1, "name": "Tsuki" } }
```

For pagination or other side-band info, use `withMeta`:

```ts
import { withMeta } from '@app/common/response/envelope.types'

@Get('/posts')
async list() {
  const rows = await this.posts.list()
  return withMeta(rows, { total: rows.length, page: 1, pageSize: rows.length })
}
// → 200  { "data": [...], "meta": { "total": 1, "page": 1, "pageSize": 1 } }
```

To opt out of envelope wrapping (raw bytes, file downloads, SSE, redirects, etc.), annotate the handler or controller with `@ResponsePassthrough()`:

```ts
import { ResponsePassthrough } from '@app/common/decorators/response-passthrough.decorator'

@Get('/feed.xml')
@ResponsePassthrough()
async feed() {
  return new Response(xml, { headers: { 'content-type': 'application/xml' } })
}
```

### Error

Errors are serialized by `AppExceptionFilter` into a `{ error }` envelope. Codes are declared in `src/common/errors/app-error-code.ts` with payloads typed in `app-error-payload.ts` and runtime metadata (status, message, details) in `app-error-definitions.ts`.

```json
{
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "Post not found",
    "details": { "id": 9999 }
  }
}
```

Throw business errors with the type-safe factory — the payload shape is enforced by the code:

```ts
import { AppErrorCode, createAppException } from '@app/common/errors';

throw createAppException(AppErrorCode.POST_NOT_FOUND, { id });
```

Validation failures (zod pipe) and unhandled exceptions are normalized into the same envelope with codes `VALIDATION_FAILED` and `INTERNAL_ERROR`.

## Production / Docker

The `Dockerfile` is a two-stage build: the builder compiles `src/index.ts` + `src/migrate.ts` via vite SSR into `dist/main.mjs` and `dist/migrate.mjs`; the runner is a slim `node:alpine` that ships only the bundle + the `drizzle/` migrations directory + production deps. Native modules (`pg`, `ioredis`) are external to the bundle and installed in the runner stage.

### Release-phase migration

Schema migrations run in their **own service** (`migrate` in `docker-compose.prod.yml`) that exits when done. The `app` service waits for it via `service_completed_successfully`:

```yaml
app:
  depends_on:
    migrate:
      condition: service_completed_successfully
```

This avoids the migrate-on-boot races that bite multi-replica deployments. `src/migrate.ts` also wraps `drizzle-orm/node-postgres/migrator` in a `pg_advisory_lock`, so even if two replicas race the same migration step, postgres serializes them — only the first applies, the rest no-op.

The container's `docker-entrypoint.sh` can also auto-migrate on boot as a convenience for single-instance deployments:

| `AUTO_MIGRATE`   | Behaviour                                                                      |
| ---------------- | ------------------------------------------------------------------------------ |
| `true` (default) | Run `node migrate.mjs` before starting the server                              |
| `false`          | Skip; rely on an external migration step (e.g., the `migrate` compose service) |

Overriding the command (`docker run … bash`, `… node migrate.mjs`) always skips auto-migrate.

### Bring up the stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Order of operations:

1. `postgres` starts, waits for `pg_isready`.
2. `migrate` runs `node migrate.mjs`, exits 0.
3. `app` boots with `AUTO_MIGRATE=false` (the migrate service already did the work) and starts the HTTP server.
4. `app` health is probed by hitting `/internal/openapi.json`.

### Run migrations manually

```bash
# Build once
docker compose -f docker-compose.prod.yml build migrate

# Apply pending migrations
docker compose -f docker-compose.prod.yml run --rm migrate
```

## Scripts

| Command            | What it does                        |
| ------------------ | ----------------------------------- |
| `pnpm dev`         | nodemon + vite-node, watches `src/` |
| `pnpm build`       | vite SSR build to `dist/main.mjs`   |
| `pnpm start`       | run the built artifact with Node    |
| `pnpm typecheck`   | `tsc --noEmit`                      |
| `pnpm test`        | vitest run                          |
| `pnpm db:generate` | drizzle-kit: generate migration     |
| `pnpm db:migrate`  | drizzle-kit: apply migrations       |
| `pnpm db:studio`   | drizzle-kit: open Studio UI         |

## Layout

```
src/
├── index.ts              # entry: CLI pipeline → bootstrap HTTP
├── env.ts                # zod-validated process.env
├── app.factory.ts        # createApplication + global enhancers
├── app.constants.ts      # APP_GLOBAL_PREFIX
├── openapi.ts            # registers /internal/openapi.json + /internal/docs
├── cli/                  # CLI pipeline placeholder for non-HTTP commands
├── common/
│   ├── errors/           # AppException + typed code/payload/definition tables
│   ├── response/         # SuccessEnvelope + withMeta helper
│   └── decorators/       # @ResponsePassthrough
├── filters/              # AppExceptionFilter ({error} envelope)
├── interceptors/         # LoggingInterceptor + ResponseInterceptor ({data} envelope)
├── migrate.ts            # production migration entry (advisory-locked)
├── database/             # pg pool + drizzle wrapper + schema
├── redis/                # ioredis provider
└── modules/
    ├── index.module.ts   # root module composition
    ├── hello/            # zod-validated request demo
    ├── posts/            # DB-backed CRUD + event emission
    ├── cache/            # Redis read/write demo
    └── events/           # @EmitEvent / @OnEvent demo
```
