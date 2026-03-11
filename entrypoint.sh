#!/usr/bin/env sh
set -e

echo "[ENTRYPOINT] Running database bootstrap..."

python -m BackEnd.Services.bootstrap_master

echo "[ENTRYPOINT] Starting Gunicorn..."

exec gunicorn --bind 0.0.0.0:${PORT} BackEnd.Services.api_server:app
