FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./

RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('./package.json','utf8')); for (const k of ['dependencies','devDependencies','peerDependencies']) { if (!p[k]) continue; for (const d in p[k]) if (typeof p[k][d]==='string' && p[k][d].startsWith('workspace:')) p[k][d]='latest'; } fs.writeFileSync('./package.json', JSON.stringify(p,null,2));"

RUN pnpm install --no-frozen-lockfile --ignore-scripts \
  && pnpm rebuild @swc/core esbuild || true

COPY tsconfig.json vite.config.ts drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app

RUN apk add --no-cache bash tini

COPY --from=builder /app/dist/ ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json

RUN corepack enable && corepack prepare pnpm@latest --activate \
  && pnpm install --prod --no-frozen-lockfile --ignore-scripts \
  && pnpm store prune

COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

ENV NODE_ENV=production
ENV MIGRATIONS_DIR=/app/drizzle
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
