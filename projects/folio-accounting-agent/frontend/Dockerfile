FROM node:24.13.0-alpine AS builder

ARG APP_VERSION=dev

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN VITE_APP_VERSION="$APP_VERSION" pnpm build

FROM joseluisq/static-web-server:2.44.0

ARG APP_VERSION=dev

LABEL org.opencontainers.image.revision=${APP_VERSION}

COPY --from=builder /app/dist /public
COPY static-web-server.toml /etc/static-web-server.toml

ENV SERVER_ROOT=/public \
    SERVER_PORT=8000 \
    SERVER_HEALTH=true \
    SERVER_FALLBACK_PAGE=/public/index.html \
    SERVER_CONFIG_FILE=/etc/static-web-server.toml

USER 10001:10001

EXPOSE 8000
