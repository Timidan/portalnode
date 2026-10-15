# PortalNode agent: serves the console and API, runs the collector and keeper.
FROM node:22-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-slim AS agent
WORKDIR /src/agent
COPY agent/package.json agent/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY agent/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/agent
COPY --from=agent /src/agent/dist ./dist
COPY --from=agent /src/agent/node_modules ./node_modules
COPY --from=agent /src/agent/package.json ./
COPY --from=web /src/web/dist /app/web/dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
