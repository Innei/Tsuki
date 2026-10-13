# Security audit

The audit traced HTTP parsing, guards, DTO validation/transformation, DI access, Redis event dispatch, OpenAPI output, the starter, scaffolding, and dependency advisories. Findings below have behavior regressions rather than snapshots of implementation constants.

| Boundary                             | Reproduced problem                                                                                                      | Fix                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| DTO construction and transformation  | JSON containing `__proto__` replaces the instance prototype and injects inherited fields such as `isAdmin`.             | Copy this key as an own data property, preserving the DTO prototype and normal setters. |
| Validation responses                 | Invalid record fields named `constructor` or `toString` throw a TypeError instead of returning a validation response.   | Store error buckets in a dictionary without inherited properties.                       |
| Global guards                        | A null/undefined guard silently disappears; a guard returning a truthy non-boolean allows protected requests.           | Reject invalid guard configuration and authorize only a literal `true`.                 |
| JSON parsing                         | `text/plain; application/json` is parsed as JSON, admitting a browser-safelisted content type into JSON mutation paths. | Match the media-type essence exactly, case-insensitively.                               |
| Temporary DI scopes                  | Overlapping asynchronous `ContainerRef.runWith()` calls read each other's containers and restore the wrong default.     | Isolate temporary references with AsyncLocalStorage.                                    |
| Redis event subscription             | Messages from another channel or a retiring subscriber still reach handlers, including when shutdown fails.             | Check the active subscriber and channel; stop receiving before teardown.                |
| Template publication and scaffolding | `.env.local` and `.env.production` credentials are copied into the template and generated project.                      | Exclude `.env.*` except `.env.example` at both copy boundaries.                         |
| Starter diagnostics                  | `redis://:password@host` credentials survive URL masking and appear in logs.                                            | Report only whether connection URLs are configured.                                     |
| Starter cache API                    | HTTP callers can read unrelated Redis keys or overwrite event counters.                                                 | Limit accesses to the `cache:` namespace.                                               |
| Development Compose                  | Redis without authentication and Postgres with demo credentials listen on every host interface.                         | Bind published database ports to `127.0.0.1`.                                           |

Package archives also omit `.gitignore`. The CLI now ships the starter's rules as `_gitignore` and restores the filename when scaffolding. Generated projects ignore `.env` and `.env.*`, while `.env.example` remains trackable.

## Dependency changes

Hono is updated to 4.13.13, with a supported peer minimum of 4.13.7; the Node adapter resolves to 1.19.17. The Hono upgrade includes the [upstream JSX escaping fix](https://github.com/honojs/hono/security/advisories/GHSA-hxh3-vqpv-xpqv). Development dependencies are refreshed within compatible ranges. Two scoped overrides replace vulnerable tar and esbuild versions held by old development-tool dependencies.

`pnpm audit --prod` reports no known vulnerabilities. The full audit retains one development-only warning for `braces` 3.0.3, used by ESLint, changelog tooling, and nodemon. [The advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched release. Do not feed untrusted glob patterns into these tools.

## Compatibility and limits

- Guards must implement `canActivate()` and return a boolean. Invalid global guards now fail startup.
- JSON lookalike media types no longer produce parsed bodies. Non-JSON bodies retain the existing `null` behavior; applications still need their own CSRF policy.
- Existing starter cache entries need to be copied to `cache:<key>` to remain accessible.
- Tsuki still assumes one active application per process. Temporary DI scopes are isolated; this does not introduce full multi-application support.
- Redis producer permissions and runtime event payload validation remain application responsibilities.
- No production deployment or live Redis/database penetration test was performed. The audit does not cover application-specific authentication or authorization rules.
