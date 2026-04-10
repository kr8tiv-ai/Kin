FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY api/ api/
COPY bot/ bot/
COPY companions/ companions/
COPY config/ config/
COPY db/ db/
COPY inference/ inference/
COPY runtime/ runtime/
COPY scripts/ scripts/
COPY solana/ solana/
COPY tailscale/ tailscale/
COPY voice/ voice/
COPY website/ website/
COPY admin/ admin/
COPY assets/ assets/
COPY types/ types/

# Build TypeScript with production config (no sourcemaps/declarations)
RUN npx tsc -p tsconfig.build.json

# ─── Production image ────────────────────────────────────────
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install ffmpeg for voice pipeline audio conversion
RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist dist/
COPY db/ db/
COPY admin/ admin/
COPY assets/ assets/

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Create data directory for SQLite and set ownership
RUN mkdir -p data && chown -R app:app data

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Default: start both API and bot
CMD ["node", "dist/scripts/start.js"]
