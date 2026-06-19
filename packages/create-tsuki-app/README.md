# create-tsuki-app

Scaffold a new Tsuki application from the official starter template.

## Usage

```bash
pnpm create tsuki-app my-app
# or
npm create tsuki-app@latest my-app
# or
yarn create tsuki-app my-app
```

Then:

```bash
cd my-app
pnpm install
docker compose up -d
cp .env.example .env
pnpm db:generate && pnpm db:migrate
pnpm dev
```

The template is sourced from [`examples/starter`](../../examples/starter) in the Tsuki monorepo. See its README for the full feature tour and demo endpoints.

## Maintainer notes

- The published tarball ships a `template/` directory that mirrors `examples/starter` at the time of publish.
- `pnpm sync-template` copies `examples/starter` into `template/` and rewrites `workspace:*` deps to real version ranges.
- `pnpm prepublishOnly` runs `sync-template` then `build`, so the freshest template is always bundled.
