# syntax=docker/dockerfile:1
# ChurchOS — containerized static build, served by a NON-ROOT nginx.
# (Primary deploy is Vercel; this is the self-host / portability path.)

# ── build stage ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── runtime: non-root nginx serving the SPA ──────────────────
# nginx-unprivileged runs as an unprivileged user (UID 101) and listens on 8080
# — no root anywhere in the running container.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --chown=101:101 docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
