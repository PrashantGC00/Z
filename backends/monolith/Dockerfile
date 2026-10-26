FROM node:22.15.1-alpine AS base
RUN npm install -g pnpm@12.14.0
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter ./backends/monolith...
RUN pnpm --filter ./backends/monolith build
RUN pnpm --filter ./backends/monolith deploy --prod /out

FROM node:22.15.1-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /app/backends/monolith/dist ./dist
COPY --from=build /app/api/openapi.yaml ./api/openapi.yaml
ENV OPENAPI_SPEC=/app/api/openapi.yaml

USER node
EXPOSE 3000
CMD ["node", "--import", "./dist/platform/telemetry.js", "dist/main.js"]
