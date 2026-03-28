FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
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
COPY .env.example ./

# Build TypeScript
RUN npx tsc

# ─── Production image ────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install ffmpeg for voice pipeline audio conversion
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/dist dist/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/db db/
COPY --from=builder /app/admin admin/
COPY --from=builder /app/assets assets/
COPY --from=builder /app/.env.example ./

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 3000

# Default: start both API and bot
CMD ["node", "dist/scripts/start.js"]
