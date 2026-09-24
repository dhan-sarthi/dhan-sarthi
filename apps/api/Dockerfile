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
# The system trust store, for the LiveKit SDK's native (Rust) half.
#
# Node carries its own roots, so every fetch worked without this — but the Runway tool gate joins
# the call through @livekit/rtc-node, whose TLS reads the OS store, and the slim image has none.
# Every Runway call failed at the gate with "no native root CA certificates found" and fell
# through to the next provider. Installed by apt, so /etc/ssl arrives whole and world-readable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Amazon's RDS root certificates.
#
# pg treats `sslmode=require` as `verify-full`, and the slim image's trust store carries no
# Amazon roots — so the first seed task against RDS died with "self-signed certificate in
# certificate chain". Shipping the bundle means the chain is genuinely verified, rather than
# the connection string being downgraded to an unverified mode to make the error go away.
# Its own directory, and the modes set by RUN rather than by ADD --chmod.
#
# Two traps here, both found the hard way. This base image has no /etc/ssl, so adding into
# /etc/ssl/certs *creates* it — and node then fails reading /etc/ssl/openssl.cnf with EACCES
# rather than ignoring a directory that was never there. And `ADD --chmod=644` applies 644 to
# the parent directory it creates as well as to the file: a directory with no execute bit
# cannot be traversed, so the bundle was unreadable by the non-root user either way.
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    /opt/rds/global-bundle.pem
RUN chmod 755 /opt/rds && chmod 644 /opt/rds/global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/opt/rds/global-bundle.pem
RUN groupadd --system dhan \
    && useradd --system --gid dhan --home-dir /app --shell /usr/sbin/nologin dhan
COPY --from=build --chown=dhan:dhan /out ./
USER dhan
EXPOSE 3001
# The slim image has no curl or wget; Node's fetch is enough for a liveness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]
