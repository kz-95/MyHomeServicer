# Build context: repo root  (docker-compose.yml: context: .)
# All COPY paths are relative to the repo root.
#
# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 – deps
#   Install ALL dependencies (including devDeps) needed to compile TypeScript.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# package files live in backend/, not the repo root
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 – builder
#   Copy backend source, generate Prisma client, compile TypeScript.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy only the backend directory contents into WORKDIR
# (backend/src → /app/src, backend/prisma → /app/prisma, etc.)
COPY backend/ ./

# Generate the Prisma client (needs schema.prisma + query-engine binary)
RUN npx prisma generate

# Compile TypeScript → dist/
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 – runner (production image)
#   Only production dependencies + compiled output.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Malaysia timezone – must match docker-compose.yml and CI (see BUG-001)
ENV TZ=Asia/Kuala_Lumpur

# tzdata lets Alpine honour the TZ env var
RUN apk add --no-cache tzdata

# Production-only node_modules
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Compiled JS output
COPY --from=builder /app/dist ./dist

# Prisma schema + generated client (query engine needed at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# ─────────────────────────────────────────────────────────────────────────────
# Default entrypoint: API server.
# docker-compose.yml overrides this for the worker service:
#   command: ["node", "dist/worker.js"]
# ─────────────────────────────────────────────────────────────────────────────
EXPOSE 3000
CMD ["node", "dist/index.js"]
