#!/bin/sh
set -e

echo "[ENTRYPOINT] Running database bootstrap..."
python -m BackEnd.Services.bootstrap_master || true

echo "[ENTRYPOINT] Starting Gunicorn..."

exec gunicorn \
  --bind 0.0.0.0:$PORT \
  --workers 1 \
  --timeout 180 \
  --graceful-timeout 180 \
  BackEnd.Services.api_server:app