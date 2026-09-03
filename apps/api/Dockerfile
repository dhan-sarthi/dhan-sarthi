# syntax=docker/dockerfile:1.7
#
# The API image. Build from the repository root:
#
#   docker build -f apps/api/Dockerfile -t dhan-sarthi/api .
#
# Debian slim rather than Alpine: the Runway RPC SDK sits on the LiveKit Node SDK's native
# N-API binaries, and glibc keeps that a non-question (ADR-0004, TESTING-AND-DEPLOYMENT.md).
# Nothing secret is baked in; configuration arrives as environment at start (Secrets Manager in
# AWS, apps/api/.env under compose). The seed and replay CLIs ship in the same image and are
# run as one-off tasks, never from the entrypoint (ADR-0012).

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------------------------
# base: pnpm via corepack, pinned by the packageManager field in the root package.json
# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
# The store lives where the BuildKit cache mounts below point, so repeat builds skip the fetch.
ENV npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------------------------
# deps: manifests only, so the install layer survives source edits
# ---------------------------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY packages/fixtures/package.json packages/fixtures/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@dhan/api..."

# ---------------------------------------------------------------------------------------------
# build: compile packages then the API, then prune to a self-contained production tree
# ---------------------------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm -r --filter './packages/*' build && pnpm --filter @dhan/api build
# --legacy: workspace packages are copied into the deployed node_modules rather than requiring
# inject-workspace-packages in .npmrc, which would change how every developer's install works.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @dhan/api --prod deploy --legacy /out

# ---------------------------------------------------------------------------------------------
# runtime: non-root, production only, health-checked on the ALB target path
# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
WORKDIR /app
RUN groupadd --system dhan \
    && useradd --system --gid dhan --home-dir /app --shell /usr/sbin/nologin dhan
COPY --from=build --chown=dhan:dhan /out ./
USER dhan
EXPOSE 3001
# The slim image has no curl or wget; Node's fetch is enough for a liveness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]
