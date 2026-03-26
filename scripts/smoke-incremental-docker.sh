#!/usr/bin/env bash
# Phase T3: start infra in order and sanity-check (requires Docker daemon).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

docker compose config --quiet

echo "==> ffmpeg-mcp"
docker compose up -d ffmpeg-mcp
sleep 2
curl -sf "http://127.0.0.1:8100/mcp" -o /dev/null || curl -sf "http://127.0.0.1:8100/" -o /dev/null || true

echo "==> engine-proxy"
docker compose up -d engine-proxy
sleep 4
docker compose exec -T engine-proxy python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8200/health').read().decode()[:200])"

echo "==> backend"
docker compose up -d backend
sleep 4
docker compose exec -T backend curl -sf "http://127.0.0.1:8000/docs" -o /dev/null && echo "backend /docs OK"

echo "Full stack + nginx: docker compose up -d && curl -sf http://127.0.0.1:3000/ | head -c 80"
echo "Done. Stop with: docker compose down"
