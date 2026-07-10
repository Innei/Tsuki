# Tsuki Runtime Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct event self-echo duplication, provider lifecycle resolution, runtime/OpenAPI path drift, Zod 4 constraint loss, and generated DTO build metadata while preserving public APIs.

**Architecture:** Keep the single-application container model. Add event-origin filtering, replace constructor-based lifecycle queues with instance resolvers, centralize route-path construction in `common`, adapt the existing OpenAPI converter to Zod 4 check definitions, and prevent type-only DTO constructor metadata from becoming runtime code.

**Tech Stack:** TypeScript 6, Hono 4, tsyringe 4, Zod 4, Redis pub/sub, Vitest 4, tsdown, Vite SSR.

## Global Constraints

- Preserve immediate local event dispatch and Redis cross-process broadcast.
- Treat one active `HonoHttpApplication` per process as the supported model.
- Preserve compatibility with event envelopes that do not contain `sourceId`.
- Do not add runtime dependencies.
- Apply lifecycle hooks once per singleton instance; transient providers have no lifecycle guarantee.
- Keep the existing OpenAPI converter and its current schema shapes outside the corrected constraints.
- Use behavior-oriented regression tests; do not add implementation snapshots.
- Preserve the user-owned untracked `AGENTS.md` file.

---

### Task 1: Prevent Redis self-echo duplication

**Files:**

- Modify: `packages/event-emitter/tests/events.spec.ts`
- Modify: `packages/event-emitter/src/index.ts`

**Interfaces:**

- Consumes: `EventEmitterService.emit()`, `EventMessage`, and the Redis `message` callback.
- Produces: backward-compatible `EventMessage.sourceId?: string` and exactly one local dispatch for a locally emitted event.

- [ ] **Step 1: Make the Redis test double capable of echoing published messages**

Add a switch and echo behavior to `FakeRedis`:

```ts
class FakeRedis {
  public echoPublishedMessages = false;

  publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message });
    if (this.echoPublishedMessages) {
      this.messageHandler?.(channel, message);
    }
    return Promise.resolve(1);
  }
}
```

- [ ] **Step 2: Add failing delivery tests**

Add two behavior tests to `packages/event-emitter/tests/events.spec.ts`:

```ts
it('dispatches a locally emitted event once when Redis echoes it', async () => {
  const app = await createApplication(EventTestModule);
  const container = app.getContainer();
  const emitter = container.resolve(EventEmitterService);
  const redis = container.resolve(RedisAccessor).get();
  redis.echoPublishedMessages = true;

  const deliveries: unknown[] = [];
  emitter.on('local.once', (payload) => deliveries.push(payload));

  await emitter.emit('local.once', { id: 'one' });

  expect(deliveries).toEqual([{ id: 'one' }]);
  await app.close();
});

it('dispatches remote and legacy envelopes', async () => {
  const app = await createApplication(EventTestModule);
  const container = app.getContainer();
  const emitter = container.resolve(EventEmitterService);
  const redis = container.resolve(RedisAccessor).get();
  const deliveries: unknown[] = [];
  emitter.on('remote.compatible', (payload) => deliveries.push(payload));

  redis.emit(
    'test:events',
    JSON.stringify({
      event: 'remote.compatible',
      payload: { source: 'remote' },
      emittedAt: new Date().toISOString(),
      sourceId: 'another-process',
    }),
  );
  redis.emit(
    'test:events',
    JSON.stringify({
      event: 'remote.compatible',
      payload: { source: 'legacy' },
      emittedAt: new Date().toISOString(),
    }),
  );

  expect(deliveries).toEqual([{ source: 'remote' }, { source: 'legacy' }]);
  await app.close();
});
```

- [ ] **Step 3: Run the event tests and verify RED**

Run:

```bash
rtk pnpm --filter @tsuki-hono/event-emitter exec vitest run tests/events.spec.ts
```

Expected: the self-echo test fails because `deliveries` contains two entries; the compatibility test passes.

- [ ] **Step 4: Add source identifiers and filter self-originated envelopes**

In `packages/event-emitter/src/index.ts`, import Node's UUID generator:

```ts
import { randomUUID } from 'node:crypto';
```

Extend the public envelope:

```ts
export interface EventMessage<T = unknown> {
  emittedAt: string;
  event: string;
  payload: T;
  sourceId?: string;
}
```

Add an immutable identifier to `EventEmitterService`:

```ts
export class EventEmitterService implements OnModuleDestroy {
  private readonly sourceId = randomUUID();
}
```

Replace the subscriber's event guard with:

```ts
if (!envelope?.event || envelope.sourceId === this.sourceId) return;
```

Add `sourceId` to the envelope created by `emit()`:

```ts
const envelope: EventMessage<InferEventPayload<T>> = {
  event,
  payload,
  emittedAt: new Date().toISOString(),
  sourceId: this.sourceId,
};
```

- [ ] **Step 5: Run the event package tests and verify GREEN**

Run:

```bash
rtk pnpm --filter @tsuki-hono/event-emitter test
```

Expected: all event-emitter tests pass, including one local delivery and both compatible remote deliveries.

- [ ] **Step 6: Commit the event correction**

```bash
rtk git add packages/event-emitter/src/index.ts packages/event-emitter/tests/events.spec.ts
rtk git commit -m "fix(events): ignore redis self echoes"
```

---

### Task 2: Resolve lifecycle hooks through canonical provider instances

**Files:**

- Modify: `packages/core/tests/application.spec.ts`
- Modify: `packages/core/src/application.ts`
- Modify: `packages/core/README.md`

**Interfaces:**

- Consumes: module provider configurations and the existing lifecycle hook interfaces.
- Produces: singleton lifecycle resolution by actual registration token and instance-level hook deduplication.

- [ ] **Step 1: Add a failing custom-token lifecycle test**

Add this case under `Lifecycle hooks integration`:

```ts
it('runs lifecycle hooks once for custom-token singleton providers', async () => {
  const CLASS_TOKEN = Symbol('CLASS_TOKEN');
  const VALUE_TOKEN = Symbol('VALUE_TOKEN');
  const FACTORY_TOKEN = Symbol('FACTORY_TOKEN');
  const ALIAS_TOKEN = Symbol('ALIAS_TOKEN');
  const calls: string[] = [];

  @injectable()
  class ClassLifecycle implements OnModuleInit, OnModuleDestroy {
    onModuleInit() {
      calls.push('class:init');
    }
    onModuleDestroy() {
      calls.push('class:destroy');
    }
  }

  const valueLifecycle = {
    onModuleInit: () => calls.push('value:init'),
    onModuleDestroy: () => calls.push('value:destroy'),
  };

  @Module({
    providers: [
      { provide: CLASS_TOKEN, useClass: ClassLifecycle },
      { provide: ALIAS_TOKEN, useExisting: CLASS_TOKEN },
      { provide: VALUE_TOKEN, useValue: valueLifecycle },
      {
        provide: FACTORY_TOKEN,
        useFactory: () => ({
          onModuleInit: () => calls.push('factory:init'),
          onModuleDestroy: () => calls.push('factory:destroy'),
        }),
      },
    ],
  })
  class ProviderLifecycleModule {}

  const app = await createApplication(ProviderLifecycleModule);
  expect(calls).toEqual(['class:init', 'value:init', 'factory:init']);
  expect(app.getContainer().resolve(ALIAS_TOKEN)).toBe(app.getContainer().resolve(CLASS_TOKEN));

  calls.length = 0;
  await app.close('provider-lifecycle');
  expect(calls).toEqual(['factory:destroy', 'value:destroy', 'class:destroy']);
});
```

- [ ] **Step 2: Run the core test and verify RED**

Run:

```bash
rtk pnpm --filter @tsuki-hono/core exec vitest run tests/application.spec.ts -t "custom-token singleton providers"
```

Expected: application creation rejects while attempting to resolve `ClassLifecycle` instead of `CLASS_TOKEN`.

- [ ] **Step 3: Introduce lifecycle resolvers instead of constructor tokens**

In `packages/core/src/application.ts`, replace `pendingLifecycleTokens` and constructor-based `moduleInitCalled` with resolver and instance state:

```ts
type LifecycleResolver = () => unknown;

private readonly pendingLifecycleResolvers: LifecycleResolver[] = [];
private readonly moduleInitCalled = new Set<unknown>();

private hasLifecycleConstructor(ctor: Constructor | undefined): boolean {
  if (!ctor?.prototype) return false;
  const prototype = ctor.prototype;
  return (
    typeof prototype.onModuleInit === 'function' ||
    typeof prototype.onModuleDestroy === 'function' ||
    typeof prototype.onApplicationBootstrap === 'function' ||
    typeof prototype.beforeApplicationShutdown === 'function' ||
    typeof prototype.onApplicationShutdown === 'function'
  );
}

private enqueueLifecycleResolver(
  resolver: LifecycleResolver,
  metatype?: Constructor,
  inspectResult = false,
): void {
  if (!inspectResult && !this.hasLifecycleConstructor(metatype)) return;
  this.pendingLifecycleResolvers.push(resolver);
}
```

Remove `scopedTokens` plumbing from `registerProvider`, `registerGlobalEnhancer`, `registerRegularProvider`, `registerClassProvider`, and `registerModule`. Queue resolvers at registration time:

```ts
// Constructor provider and controller
this.enqueueLifecycleResolver(() => this.getProviderInstance(provider), provider);

// Singleton useClass
this.enqueueLifecycleResolver(() => this.container.resolve(provideToken as any), useClass);

// useValue
this.enqueueLifecycleResolver(() => useValue, undefined, true);

// singleton useFactory and useExisting
this.enqueueLifecycleResolver(() => this.container.resolve(provideToken as any), undefined, true);
```

Do not enqueue resolvers when `singleton === false`.

Remove registration-time calls to `registerLifecycleHandlers()` from regular and APP `useValue` branches. Lifecycle handlers are registered when queued resolvers execute, preserving provider registration order for reverse-order shutdown.

- [ ] **Step 4: Invoke and deduplicate lifecycle hooks by instance**

Replace `invokeModuleInit(tokens)` with:

```ts
private async invokeModuleInit(): Promise<void> {
  for (const resolve of this.pendingLifecycleResolvers) {
    const instance = resolve();
    this.registerLifecycleHandlers(instance);

    if (!isOnModuleInitHook(instance) || this.moduleInitCalled.has(instance)) {
      continue;
    }

    this.moduleInitCalled.add(instance);
    await instance.onModuleInit();
  }
}
```

Call `await this.invokeModuleInit()` after all modules have registered. Singleton factory resolution is intentionally eager at this point. Existing `registerLifecycleInstance()` continues to deduplicate shutdown and bootstrap hooks by object identity.

For APP enhancer factories, replace the factory branch with a cached raw resolver so lifecycle initialization and enhancer materialization use the same instance:

```ts
if ('useFactory' in config && config.useFactory) {
  let created = false;
  let rawValue: unknown;

  const resolveRawValue = () => {
    if (!created) {
      const deps = (config.inject ?? []).map((token) => this.container.resolve(token as any));
      rawValue = (config.useFactory as (...args: any[]) => unknown)(...deps);
      created = true;
    }
    return rawValue;
  };

  this.enqueueLifecycleResolver(
    () => {
      const value = resolveRawValue();
      return enhancerType === 'middleware'
        ? (this.extractMiddlewareLifecycleTarget(value) ?? value)
        : value;
    },
    undefined,
    true,
  );

  this.addGlobalEnhancerResolver(enhancerType, () => {
    const value = resolveRawValue();
    return enhancerType === 'middleware' ? this.resolveMiddlewareDefinition(value) : value;
  });
  return;
}
```

In the APP `useClass` branch, queue the registered class:

```ts
this.enqueueLifecycleResolver(() => this.getProviderInstance(useClass), useClass);
```

In the APP `useExisting` branch, queue the aliased instance and unwrap middleware definitions:

```ts
this.enqueueLifecycleResolver(
  () => {
    const value = this.container.resolve(config.useExisting as any);
    return enhancerType === 'middleware'
      ? (this.extractMiddlewareLifecycleTarget(value) ?? value)
      : value;
  },
  undefined,
  true,
);
```

In the APP `useValue` branch, queue the supplied value using the same middleware rule:

```ts
this.enqueueLifecycleResolver(
  () =>
    enhancerType === 'middleware'
      ? (this.extractMiddlewareLifecycleTarget(config.useValue) ?? config.useValue)
      : config.useValue,
  undefined,
  true,
);
```

- [ ] **Step 5: Document lifecycle scope**

Append to the lifecycle section in `packages/core/README.md`:

```md
Lifecycle hooks apply to constructor providers, values, aliases, and singleton
`useClass`/`useFactory` providers. Singleton factories are materialized during
application initialization so their hooks can be discovered. Transient providers
do not have an application lifecycle because they do not have one canonical instance.
```

- [ ] **Step 6: Run core tests and verify GREEN**

Run:

```bash
rtk pnpm --filter @tsuki-hono/core test
```

Expected: all core tests pass; custom-token class, value, factory, and alias hooks each run once.

- [ ] **Step 7: Commit the lifecycle correction**

```bash
rtk git add packages/core/src/application.ts packages/core/tests/application.spec.ts packages/core/README.md
rtk git commit -m "fix(core): resolve lifecycle providers by token"
```

---

### Task 3: Share runtime and OpenAPI route-path construction

**Files:**

- Create: `packages/common/src/utils/route-path.ts`
- Modify: `packages/common/src/index.ts`
- Modify: `packages/core/src/application.ts`
- Modify: `packages/openapi/src/index.ts`
- Modify: `packages/openapi/tests/openapi.spec.ts`

**Interfaces:**

- Consumes: controller prefix, route path, global prefix, and `bypassGlobalPrefix`.
- Produces: `buildRoutePath(options: BuildRoutePathOptions): string` shared by runtime and documentation.

- [ ] **Step 1: Add a failing OpenAPI path-parity test**

Add to `packages/openapi/tests/openapi.spec.ts`:

```ts
it('matches runtime paths when a controller bypasses the global prefix', () => {
  @Controller({ prefix: 'static', bypassGlobalPrefix: true })
  class StaticController {
    @Get('/asset')
    asset() {}
  }

  @Module({ controllers: [StaticController] })
  class StaticModule {}

  const doc = createOpenApiDocument(StaticModule, {
    title: 'test',
    version: '0.0.0',
    globalPrefix: '/api',
  });

  expect(doc.paths['/static/asset']).toBeDefined();
  expect(doc.paths['/api/static/asset']).toBeUndefined();
});
```

- [ ] **Step 2: Run the OpenAPI test and verify RED**

Run:

```bash
rtk pnpm --filter @tsuki-hono/openapi exec vitest run tests/openapi.spec.ts -t "bypasses the global prefix"
```

Expected: `/static/asset` is absent and `/api/static/asset` is present.

- [ ] **Step 3: Add the shared route-path helper**

Create `packages/common/src/utils/route-path.ts`:

```ts
export interface BuildRoutePathOptions {
  bypassGlobalPrefix?: boolean;
  controllerPrefix?: string;
  globalPrefix?: string;
  routePath?: string;
}

export function buildRoutePath(options: BuildRoutePathOptions): string {
  const pieces = [options.routePath];

  if (options.controllerPrefix) {
    pieces.unshift(options.controllerPrefix);
  }
  if (!options.bypassGlobalPrefix && options.globalPrefix) {
    pieces.unshift(options.globalPrefix);
  }

  const normalized = pieces
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => (segment.startsWith('/') ? segment : `/${segment}`));

  const joined = normalized.join('').replaceAll(/[/\\]+/g, '/');
  if (joined.length > 1 && joined.endsWith('/')) {
    return joined.slice(0, -1);
  }

  return joined || '/';
}
```

Export it from `packages/common/src/index.ts`:

```ts
export * from './utils/route-path';
```

- [ ] **Step 4: Delegate both consumers to the helper**

Import `buildRoutePath` in core and keep the private method as a compatibility-preserving internal delegate:

```ts
private buildPath(
  controller: ReturnType<typeof getControllerMetadata>,
  routePath: string,
): string {
  return buildRoutePath({
    bypassGlobalPrefix: controller.bypassGlobalPrefix,
    controllerPrefix: controller.prefix,
    globalPrefix: this.options.globalPrefix,
    routePath,
  });
}
```

Import and use the same helper in OpenAPI:

```ts
const fullPath = buildRoutePath({
  bypassGlobalPrefix: controllerMetadata.bypassGlobalPrefix,
  controllerPrefix: controllerMetadata.prefix,
  globalPrefix: options.globalPrefix,
  routePath: route.path,
});
```

Delete the OpenAPI-local `normalizePath()` function.

- [ ] **Step 5: Run common, core, and OpenAPI tests and verify GREEN**

Run:

```bash
rtk pnpm --filter @tsuki-hono/common test
rtk pnpm --filter @tsuki-hono/core test
rtk pnpm --filter @tsuki-hono/openapi test
```

Expected: all three package suites pass and the bypass path matches runtime behavior.

- [ ] **Step 6: Commit the path correction**

```bash
rtk git add packages/common/src/utils/route-path.ts packages/common/src/index.ts packages/core/src/application.ts packages/openapi/src/index.ts packages/openapi/tests/openapi.spec.ts
rtk git commit -m "fix(openapi): share runtime route path rules"
```

---

### Task 4: Preserve Zod 4 validation constraints in OpenAPI

**Files:**

- Modify: `packages/openapi/tests/openapi.spec.ts`
- Modify: `packages/openapi/src/index.ts`

**Interfaces:**

- Consumes: legacy Zod checks and Zod 4 check definitions.
- Produces: OpenAPI string length/format and numeric bound/integer constraints.

- [ ] **Step 1: Add a failing schema-constraint test**

Add under the Zod 4 schema-lowering describe block:

```ts
it('preserves string and number constraints', () => {
  class ConstraintDto extends createZodSchemaDto(
    z.object({
      email: z.string().min(3).max(64).email(),
      code: z.string().length(8),
      count: z.number().min(1).max(10).int(),
      ratio: z.number().gt(0).lt(1),
    }),
    { name: 'ConstraintDto' },
  ) {}

  @Controller('constraints')
  class ConstraintController {
    @Post('/')
    create(@Body() _body: ConstraintDto) {}
  }

  const doc = buildDocFromController(ConstraintController);
  const properties = (doc.components?.schemas?.ConstraintDto as any).properties;

  expect(properties.email).toEqual({
    type: 'string',
    minLength: 3,
    maxLength: 64,
    format: 'email',
  });
  expect(properties.code).toEqual({ type: 'string', minLength: 8, maxLength: 8 });
  expect(properties.count).toMatchObject({ type: 'integer', minimum: 1, maximum: 10 });
  expect(properties.ratio).toMatchObject({
    type: 'number',
    exclusiveMinimum: 0,
    exclusiveMaximum: 1,
  });
});
```

- [ ] **Step 2: Run the constraint test and verify RED**

Run:

```bash
rtk pnpm --filter @tsuki-hono/openapi exec vitest run tests/openapi.spec.ts -t "preserves string and number constraints"
```

Expected: schemas contain only primitive `type` values and omit the asserted constraints.

- [ ] **Step 3: Normalize legacy and Zod 4 check definitions**

Add a helper near `getDefinition()`:

```ts
function getCheckDefinition(check: unknown): Record<string, any> {
  if (!check || typeof check !== 'object') return {};

  const publicDef = Reflect.get(check, 'def');
  if (publicDef && typeof publicDef === 'object') {
    return publicDef as Record<string, any>;
  }

  const internal = Reflect.get(check, '_zod');
  if (internal && typeof internal === 'object') {
    const internalDef = Reflect.get(internal, 'def');
    if (internalDef && typeof internalDef === 'object') {
      return internalDef as Record<string, any>;
    }
  }

  return check as Record<string, any>;
}
```

- [ ] **Step 4: Map Zod 4 string and numeric checks**

In `buildStringSchema()`, retain legacy cases and add normalized cases:

```ts
for (const rawCheck of def.checks ?? []) {
  const check = getCheckDefinition(rawCheck);
  const kind = rawCheck.kind ?? check.check;

  switch (kind) {
    case 'min':
    case 'min_length':
      jsonSchema.minLength = rawCheck.value ?? check.minimum;
      break;
    case 'max':
    case 'max_length':
      jsonSchema.maxLength = rawCheck.value ?? check.maximum;
      break;
    case 'length':
    case 'length_equals': {
      const length = rawCheck.value ?? check.length;
      jsonSchema.minLength = length;
      jsonSchema.maxLength = length;
      break;
    }
    case 'email':
    case 'uuid':
    case 'url':
      jsonSchema.format = kind === 'url' ? 'uri' : kind;
      break;
    case 'string_format':
      if (check.format === 'url') jsonSchema.format = 'uri';
      else if (typeof check.format === 'string') jsonSchema.format = check.format;
      break;
  }
}
```

In `buildNumberSchema()`, retain legacy cases and add:

```ts
for (const rawCheck of def.checks ?? []) {
  const check = getCheckDefinition(rawCheck);
  const kind = rawCheck.kind ?? check.check;

  switch (kind) {
    case 'min':
      if (rawCheck.inclusive === false) jsonSchema.exclusiveMinimum = rawCheck.value;
      else jsonSchema.minimum = rawCheck.value;
      break;
    case 'max':
      if (rawCheck.inclusive === false) jsonSchema.exclusiveMaximum = rawCheck.value;
      else jsonSchema.maximum = rawCheck.value;
      break;
    case 'greater_than':
      if (check.inclusive === false) jsonSchema.exclusiveMinimum = check.value;
      else jsonSchema.minimum = check.value;
      break;
    case 'less_than':
      if (check.inclusive === false) jsonSchema.exclusiveMaximum = check.value;
      else jsonSchema.maximum = check.value;
      break;
    case 'int':
      jsonSchema.type = 'integer';
      break;
    case 'number_format':
      if (typeof check.format === 'string' && check.format.includes('int')) {
        jsonSchema.type = 'integer';
      }
      break;
  }
}
```

- [ ] **Step 5: Run OpenAPI tests and verify GREEN**

Run:

```bash
rtk pnpm --filter @tsuki-hono/openapi test
```

Expected: all OpenAPI tests pass with preserved Zod 4 constraints.

- [ ] **Step 6: Commit the constraint correction**

```bash
rtk git add packages/openapi/src/index.ts packages/openapi/tests/openapi.spec.ts
rtk git commit -m "fix(openapi): preserve zod 4 constraints"
```

---

### Task 5: Remove the generated DTO runtime type reference

**Files:**

- Modify: `packages/common/src/pipes/zod-validation.pipe.ts`

**Interfaces:**

- Consumes: `buildZodSchemaDto<TSchema>()`.
- Produces: identical DTO runtime behavior and generic instance type without a runtime `z.output` lookup.

- [ ] **Step 1: Verify the build warning as the RED reproduction**

Run:

```bash
rtk pnpm -C examples/starter build
```

Expected: build exits successfully but reports that `output` is not exported by Zod at `zod-validation.pipe.ts:89`.

No source-level snapshot test is added because it would assert a compiler implementation detail rather than observable DTO behavior.

- [ ] **Step 2: Remove the runtime metadata source**

Change only the generated class constructor parameter:

```ts
@ZodSchema(schema)
class ZodSchemaDto {
  constructor(initial?: unknown) {
    if (initial && typeof initial === 'object') {
      Object.assign(this, initial);
    }
  }
}
```

Keep the existing `Constructor<z.output<TSchema>>` function return types unchanged.

- [ ] **Step 3: Verify DTO behavior and a warning-free build**

Run:

```bash
rtk pnpm --filter @tsuki-hono/common test
rtk pnpm -C examples/starter build
```

Expected: common tests pass and the starter build contains no `output is not exported by zod` warning.

- [ ] **Step 4: Commit the metadata correction**

```bash
rtk git add packages/common/src/pipes/zod-validation.pipe.ts
rtk git commit -m "fix(common): avoid runtime zod output metadata"
```

---

### Task 6: Full regression verification

**Files:**

- Verify all modified source, test, and documentation files.
- Preserve: `AGENTS.md` as an untracked user-owned file.

**Interfaces:**

- Consumes: all five completed corrections.
- Produces: repository-wide evidence that tests, types, builds, and formatting remain valid.

- [ ] **Step 1: Run the complete test suite**

```bash
rtk pnpm test
```

Expected: all common, core, event-emitter, and OpenAPI tests pass; starter reports no test files and exits successfully.

- [ ] **Step 2: Run the unfiltered typecheck**

```bash
rtk proxy pnpm typecheck
```

Expected: exit code 0 with no TypeScript diagnostics.

- [ ] **Step 3: Run the complete production build**

```bash
rtk pnpm build
```

Expected: all packages and the starter build successfully, with no Zod `output` export warning.

- [ ] **Step 4: Check formatting and workspace scope**

```bash
rtk git diff --check
rtk git status --short
```

Expected: no whitespace errors; only planned files are modified and the pre-existing untracked `AGENTS.md` remains untouched.

- [ ] **Step 5: Review the final diff against the design**

Confirm all of the following directly in the diff and test results:

- self-originated Redis envelopes are ignored while legacy envelopes work;
- lifecycle providers resolve through canonical tokens and hooks deduplicate by instance;
- runtime and OpenAPI use the shared path helper;
- Zod 4 constraints are present without unrelated schema-shape changes;
- generated DTOs no longer produce the runtime Zod export warning;
- no multi-application container refactor was introduced.
