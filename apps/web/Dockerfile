# syntax=docker/dockerfile:1.7
#
# The web image: a Vite build served by nginx. Build from the repository root:
#
#   docker build -f apps/web/Dockerfile -t dhan-sarthi/web .
#
# nginx proxies /api to the API named by API_UPSTREAM (nginx.conf.template; the compose service
# by default). In AWS the same dist/ goes to S3 behind CloudFront and this image is not used
# (TESTING-AND-DEPLOYMENT.md).

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
ENV npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY packages/fixtures/package.json packages/fixtures/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@dhan/web..."

FROM deps AS build
# The bank build sets this false so the offline simulation chunk is absent (ADR-0001).
ARG VITE_OFFLINE_FALLBACK=true
ENV VITE_OFFLINE_FALLBACK=${VITE_OFFLINE_FALLBACK}
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm -r --filter './packages/*' build && pnpm --filter @dhan/web build

FROM nginx:alpine AS runtime
# Defaults are the compose stack; a deployment overrides them with plain environment variables.
ENV API_UPSTREAM=http://api:3001
ENV DNS_RESOLVER=127.0.0.11
ENV RESOLVER_FLAGS=ipv6=off
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
