#!/bin/bash
set -e

# Load env variables if .env exists (handles values with spaces safely)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Starting RQ Worker..."
exec python run_worker.py
