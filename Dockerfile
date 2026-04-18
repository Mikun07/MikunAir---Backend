# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: Development (for Docker Compose hot-reload) ──────────────────────
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
COPY drizzle.config.ts ./

EXPOSE 3000
CMD ["npx", "tsx", "watch", "src/server.ts"]

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
# Copy GraphQL schema (loaded at runtime via readFileSync)
COPY src/graphql/schema.graphql ./dist/graphql/schema.graphql

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
