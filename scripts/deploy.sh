#!/usr/bin/env bash
# Pull, install, migrate, restart, check. Run on the server from the repo.
#
#   scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

git pull --ff-only
bun install --frozen-lockfile
# Migrations go first: they only ever add (the running API keeps working on the new schema meanwhile).
bun run db:migrate
pm2 restart api.assisteai.com.br --update-env
pm2 save

port=$(grep -E '^PORT=' .env | cut -d= -f2)
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${port:-3000}/health" > /dev/null; then
    echo "deploy ok: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done
echo "the API didn't become healthy: pm2 logs api.assisteai.com.br" >&2
exit 1
