# Tsuki / Hono baseline

Run from the repository root after `pnpm install`:

```sh
pnpm bench --output results/baseline.json
```

`--output` is relative to `benchmarks/`. Without it, the benchmark only prints its results.
For a quick correctness check:

```sh
pnpm bench --rounds 1 --duration 0.2 --warmup 0.1 --concurrency 2
```

The defaults are six rounds, 32 keep-alive connections, one second of warmup per route,
and three seconds of measurement per route. They can all be overridden:

```sh
pnpm bench --rounds 6 --duration 5 --warmup 2 --concurrency 32
```

## What is measured

Both implementations use the same Hono version and `@hono/node-server` adapter,
listening on `127.0.0.1`. Each server runs in a separate child process from the load
generator. Tsuki and Hono run one at a time; their order and route order alternate
between rounds. Startup and compilation are outside the measurement.

| Route        | Hono                                       | Tsuki                                      |
| ------------ | ------------------------------------------ | ------------------------------------------ |
| `GET /json`  | `context.json()` with a small object       | Controller returns the identical object    |
| `POST /json` | `context.req.json()` then `context.json()` | `@Body()` then return the identical object |

The POST body is 1,077 bytes, including a 1,024-character string. Tsuki uses its
default request context, DI, argument handling, response conversion, and enhancer
pipeline. Neither implementation adds application guards, pipes, interceptors,
database calls, or a validation schema. Framework startup logs are suppressed.
The decorators are applied through their public functions so that the benchmark
does not require an additional decorator compiler. Tsuki's source is compiled to
JavaScript by the repository's existing `tsdown` build tool before running.

Every HTTP response must have status 200, a JSON content type, and the exact
expected body. Any incorrect response, timeout, or nonzero server shutdown aborts
the benchmark. Requests use one outstanding request per connection, with no
HTTP pipelining. Latency covers client request start through complete response
body receipt. Throughput includes the time needed for in-flight requests to finish.

The summary takes the median of the per-round throughput and latency percentiles;
its p95 is the median of each round's p95, rather than a pooled percentile.

```text
Throughput drop (%) = (1 - Tsuki requests/s / Hono requests/s) × 100
```

The JSON output records every round, configuration, CPU, OS, Node, and resolved
library versions. These are local HTTP baselines: the load generator, adapter,
network stack, and body consumption are included, and they can limit throughput.
They do not isolate the cost of the framework or predict an application with
database work, authentication, TLS, Redis, or Zod validation.

## Recorded result

The measurements and environment for the security-fixed worktree are in
[`results/baseline.json`](results/baseline.json), recorded on 2026-10-14 (UTC+8)
before the package version bump. Environment: Apple M4 Max, arm64, 16 CPU cores,
Node 24.18.0, Darwin 27.0.0, Hono 4.13.13, and `@hono/node-server` 1.19.17.
Configuration: six rounds, 32 connections, one-second warmup, three-second sample.

| Route     | Hono requests/s | Tsuki requests/s | Throughput drop | Hono p50 / p95 | Tsuki p50 / p95 |
| --------- | --------------: | ---------------: | --------------: | -------------: | --------------: |
| GET JSON  |          59,181 |           47,922 |       **19.0%** | 0.52 / 0.88 ms |  0.62 / 1.15 ms |
| POST JSON |          42,062 |           28,869 |       **31.4%** | 0.69 / 1.35 ms |  1.03 / 1.60 ms |

Median p50 latency increased by 21.0% for GET and 49.0% for POST. Round three
slowed substantially for both implementations; the cause was not profiled.
It is retained in the raw results, and the table uses the six-round medians.
All responses and server shutdowns passed the assertions.
