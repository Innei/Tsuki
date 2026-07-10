# Tsuki Runtime Correctness Design

## Objective

Correct the confirmed event-delivery, provider-lifecycle, runtime/OpenAPI path-parity, Zod 4 schema-lowering, and DTO build-metadata defects without changing Tsuki's public programming model.

## Scope

The implementation covers five behavior corrections:

1. Preserve immediate in-process event dispatch while preventing the publishing process from consuming its Redis echo a second time.
2. Invoke lifecycle hooks through the token under which a provider is actually registered.
3. Use one route-path builder for runtime registration and OpenAPI generation.
4. Preserve Zod 4 string and number constraints in generated OpenAPI schemas.
5. Prevent the generated Zod DTO constructor type from becoming a runtime `z.output` reference.

Tsuki continues to assume one active `HonoHttpApplication` per process. Multi-application `ContainerRef` isolation is explicitly outside this change.

## Event Delivery

`EventEmitterService` retains the documented behavior of dispatching an event to local listeners immediately and publishing the same event through Redis for other processes.

Each service instance owns an immutable source identifier. Published envelopes include this identifier as an optional `sourceId` field. The subscriber applies the following rule:

- matching `sourceId`: ignore the message because local listeners already received it;
- different `sourceId`: dispatch it locally;
- missing `sourceId`: dispatch it locally for compatibility with older publishers.

The public `EventMessage` type exposes `sourceId?: string`. Making the field optional permits rolling upgrades in which old and new processes share a channel.

Publishing remains best-effort: a local dispatch can succeed even when Redis publishing fails. Delivery durability, retries, and transactional outbox behavior remain outside scope.

## Provider Lifecycle

Lifecycle initialization must resolve the provider by its registration token rather than by its implementation constructor.

The application records lifecycle candidates with enough information to resolve the canonical instance after all modules are registered:

| Provider form                        | Initialization behavior                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| Constructor provider                 | Resolve the constructor token and invoke hooks once                             |
| Singleton `useClass`                 | Resolve the declared `provide` token and invoke hooks once                      |
| `useValue`                           | Use the supplied instance and invoke hooks once                                 |
| Singleton `useFactory`               | Resolve the factory token during initialization, then inspect and invoke hooks  |
| `useExisting`                        | Reuse the target instance; instance-level deduplication prevents repeated hooks |
| Transient `useClass` or `useFactory` | No application lifecycle guarantee because no canonical instance exists         |

Hook deduplication is instance-based. An object reachable through multiple aliases receives each lifecycle hook once. Shutdown ordering remains reverse registration order.

All singleton factory providers are materialized during lifecycle discovery because the returned value is the only source of lifecycle metadata. Transient factories remain lazy.

## Shared Route Paths

A pure route-path helper moves to `@tsuki-hono/common`, which is already a dependency of both core and OpenAPI packages. It receives the controller metadata, route path, and optional global prefix, and applies these rules:

1. prepend the global prefix unless `bypassGlobalPrefix` is true;
2. append the controller prefix and route path;
3. normalize repeated slashes and trailing slashes;
4. return `/` when all segments are empty.

`HonoHttpApplication` and `createOpenApiDocument` both call this helper. OpenAPI continues to convert Hono `:parameter` segments to `{parameter}` only after the shared runtime path has been built.

## Zod 4 Constraint Lowering

The current schema converter remains in place to avoid broad output changes. A focused check-definition adapter reads both supported layouts:

- legacy properties such as `kind`, `value`, and `inclusive`;
- Zod 4 definitions exposed through a check object's `def` or `_zod.def` structure.

The adapter maps string length and format checks to `minLength`, `maxLength`, and `format`. It maps numeric bounds and integer formats to `minimum`, `maximum`, their exclusive variants, and `type: integer`.

Existing wrapper, union, literal, record, and query-expansion behavior remains unchanged.

## DTO Runtime Metadata

The generated DTO class accepts its internal constructor argument as `unknown`. Object inputs are still assigned to the instance. Generic output typing remains on `createZodDto` and `createZodSchemaDto` return types, so consumer-visible instance typing is preserved without causing decorator metadata to emit a runtime lookup of the type-only `z.output` symbol.

## Testing Strategy

Behavior-oriented regression tests will cover:

- one local listener invocation when Redis echoes the process's own envelope;
- delivery of remote and legacy envelopes;
- `onModuleInit` and shutdown hooks for custom-token class, value, factory, and alias providers;
- absence of duplicate hook execution through aliases;
- matching runtime and OpenAPI paths for `bypassGlobalPrefix` controllers;
- Zod 4 string length, string format, numeric bound, and integer constraints;
- a warning-free starter production build with respect to `z.output`.

Each defect follows a red-green cycle: add the smallest failing behavior test, confirm the expected failure, implement the correction, and rerun the affected package before proceeding.

## Compatibility and Non-Goals

- Existing decorators, module metadata, provider declarations, and handler signatures remain valid.
- Event envelopes from older processes remain consumable.
- No new runtime dependency is introduced.
- Multi-application container isolation is not implemented.
- Event persistence, delivery retries, dead-letter queues, and exactly-once distributed delivery are not introduced.
- The OpenAPI converter is not replaced wholesale.
