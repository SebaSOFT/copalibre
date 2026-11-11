# One compilation produces every application role. The runtime image selects a
# role at start, which keeps every role on the same reviewed release version.
FROM node:26-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g corepack@latest \
    && corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps apps
COPY packages packages
# `scripts` are copied because apps/web/scripts are invoked during web build
# and test scripts are referenced across project configs.
COPY scripts scripts
COPY tsconfig.json tsconfig.base.json jest.config.base.cjs jest.esm-mapper.cjs ./

RUN yarn install --immutable
RUN yarn tsc --build tsconfig.json
RUN yarn workspace @copalibre/design-tokens build:tokens
RUN yarn workspace @copalibre/web build
# Keep only runtime dependencies while preserving all workspace links needed by
# the six process roles and the CLI in the final image.
RUN yarn workspaces focus --all --production

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
    COPALIBRE_DATA_DIR=/var/lib/copalibre
WORKDIR /app

# npm, npx and corepack come with the base image and nothing at runtime uses
# them: every role runs with node. Removing them takes their bundled
# dependencies, and the advisories against those, out of the shipped image.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && mkdir --parents /var/lib/copalibre \
    && chown --recursive node:node /var/lib/copalibre

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/packages ./packages
# The database-setup role runs this; operators of an external database run the same file with psql.
COPY --chown=node:node deploy/postgres/roles.sql ./deploy/postgres/roles.sql

USER node

ENTRYPOINT ["node", "apps/copalibre/dist/container-entrypoint.js"]

FROM caddy:2.11-alpine AS web

COPY --from=build /app/apps/web/dist/client /srv
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
