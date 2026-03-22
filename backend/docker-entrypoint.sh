#!/bin/sh
set -eu

max_attempts="${DB_PUSH_RETRIES:-20}"
attempt=1

echo "[quoteflow-api] applying schema..."
until npx prisma db push --skip-generate; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[quoteflow-api] database setup failed after ${max_attempts} attempts."
    exit 1
  fi

  attempt=$((attempt + 1))
  echo "[quoteflow-api] database not ready, retrying in 3s..."
  sleep 3
done

echo "[quoteflow-api] seeding demo data..."
npm run db:seed

echo "[quoteflow-api] starting application..."
exec node src/server.js
