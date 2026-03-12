#!/bin/bash
set -e

echo "[ENTRYPOINT] Running database bootstrap..."

python -m BackEnd.bootstrap_master || true

echo "[ENTRYPOINT] Starting Gunicorn..."

exec gunicorn --bind 0.0.0.0:$PORT BackEnd.Services.api_server:app