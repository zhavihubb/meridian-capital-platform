#!/usr/bin/env bash
# Meridian Capital Partners — start the platform backend
set -e
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies…"
  npm install
fi
echo "Starting Meridian Capital Partners on http://localhost:${PORT:-3000}"
exec node server.js
