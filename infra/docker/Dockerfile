# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/mcp-server/package.json ./apps/mcp-server/package.json
COPY apps/app/package.json ./apps/app/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/auth/tsconfig.json ./packages/auth/tsconfig.json
COPY packages/billing/package.json ./packages/billing/package.json
COPY packages/billing/tsconfig.json ./packages/billing/tsconfig.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/config/tsconfig.json ./packages/config/tsconfig.json
COPY packages/content/package.json ./packages/content/package.json
COPY packages/content/tsconfig.json ./packages/content/tsconfig.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/core/tsconfig.json ./packages/core/tsconfig.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/database/tsconfig.json ./packages/database/tsconfig.json
COPY packages/providers/package.json ./packages/providers/package.json
COPY packages/providers/tsconfig.json ./packages/providers/tsconfig.json
COPY packages/storage-db/package.json ./packages/storage-db/package.json
COPY packages/storage-db/tsconfig.json ./packages/storage-db/tsconfig.json
COPY packages/storage-fs/package.json ./packages/storage-fs/package.json
COPY packages/storage-fs/tsconfig.json ./packages/storage-fs/tsconfig.json
COPY packages/workspace/package.json ./packages/workspace/package.json
COPY packages/workspace/tsconfig.json ./packages/workspace/tsconfig.json
COPY tooling/scripts ./tooling/scripts
COPY tooling/tsconfig ./tooling/tsconfig
RUN pnpm install --filter @vncsleal/quillby... --no-frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm --filter @vncsleal/quillby build

# ─── App (SPA) build ─────────────────────────────────────────────────────────────────
FROM base AS build-app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/app/package.json ./apps/app/package.json
COPY tooling/tsconfig ./tooling/tsconfig
RUN pnpm install --filter @quillby/app --no-frozen-lockfile
COPY apps/app ./apps/app
ARG VITE_QUILLBY_DEPLOYMENT_MODE=self-hosted
ARG VITE_QUILLBY_API_BASE_URL=/
RUN pnpm --filter @quillby/app build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV QUILLBY_TRANSPORT=http
ENV PORT=3000
ENV QUILLBY_HTTP_HOST=0.0.0.0
ENV QUILLBY_AUTH_DB_URL=file:/data/quillby-auth.db
ENV QUILLBY_DEPLOYMENT_MODE=self-hosted

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/mcp-server/package.json ./package.json
COPY --from=build /app/apps/mcp-server/bin ./bin
COPY --from=build /app/apps/mcp-server/dist ./dist
COPY --from=build-app /app/apps/app/dist ./public/app

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/mcp/server.js"]
