#!/bin/bash
set -e

# Load env variables if .env exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Starting RQ Worker..."
# Run the worker script
exec python run_worker.py
