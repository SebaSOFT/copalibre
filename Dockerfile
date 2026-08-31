# One compilation produces every application role. The runtime image selects a
# role at start, which keeps every role on the same reviewed release version.
FROM node:24-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps apps
COPY packages packages
# `yarn typecheck` below type-checks every test file too, and
# apps/web/src/help-coverage.test.ts imports scripts/check-help-coverage.mjs
# by relative path — without this, that import fails to resolve inside the
# build context (a real, previously undiscovered gap: this Dockerfile had
# never actually built against a non-empty `main` before openspec 0172's
# release PR, since `main` was an empty scaffold until then).
COPY scripts scripts
COPY tsconfig.json tsconfig.base.json jest.config.base.cjs jest.esm-mapper.cjs ./

RUN yarn install --immutable
RUN yarn typecheck
RUN yarn workspace @copalibre/design-tokens build:tokens
RUN yarn workspace @copalibre/web build
# Keep only runtime dependencies while preserving all workspace links needed by
# the six process roles and the CLI in the final image.
RUN yarn workspaces focus --all --production

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    COPALIBRE_DATA_DIR=/var/lib/copalibre
WORKDIR /app

RUN mkdir --parents /var/lib/copalibre \
    && chown --recursive node:node /var/lib/copalibre

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/packages ./packages

USER node

ENTRYPOINT ["node", "apps/copalibre/dist/container-entrypoint.js"]

FROM caddy:2.10-alpine AS web

COPY --from=build /app/apps/web/dist/client /srv
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
