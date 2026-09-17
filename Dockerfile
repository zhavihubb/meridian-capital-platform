# Meridian Capital Partners — production image
# Serves the static frontend + the Express/SQLite API from a single container.
FROM node:20-slim

# Build tools for native modules (better-sqlite3) + curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend dependencies first (better layer caching)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copy the rest of the app (frontend + backend)
COPY . .

# Persistent data lives here — mount a volume at /app/server/data
RUN mkdir -p /app/server/data/backups

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

WORKDIR /app/server
CMD ["node", "server.js"]
