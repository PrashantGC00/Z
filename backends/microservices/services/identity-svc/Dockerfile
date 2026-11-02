FROM node:24-alpine AS base
RUN npm install -g pnpm@12.14.0
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter ./backends/microservices/services/identity-svc/...
RUN pnpm --filter ./backends/microservices/services/identity-svc build
RUN pnpm --filter ./backends/microservices/services/identity-svc deploy --prod /out

FROM node:24-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /app/backends/microservices/services/identity-svc/dist ./dist
COPY --from=build /app/api/openapi.yaml ./api/openapi.yaml
ENV OPENAPI_SPEC=/app/api/openapi.yaml

USER node
EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4001/livez || exit 1

CMD ["node", "--import", "./dist/platform/telemetry.js", "dist/main.js"]

