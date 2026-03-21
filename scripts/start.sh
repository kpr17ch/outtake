#!/bin/bash
#
# start.sh — Start Outtake (FFmpeg MCP Server + Next.js App)
#
# Usage: ./scripts/start.sh
#

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${YELLOW}[outtake] Shutting down...${NC}"
  kill $MCP_PID 2>/dev/null || true
  kill $NEXT_PID 2>/dev/null || true
  wait $MCP_PID 2>/dev/null || true
  wait $NEXT_PID 2>/dev/null || true
  echo -e "${GREEN}[outtake] Stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────
# 1. Setup FFmpeg MCP Server Python env
# ─────────────────────────────────────────────
MCP_DIR="$PROJECT_ROOT/services/ffmpeg_mcp"

if [ ! -d "$MCP_DIR/.venv" ]; then
  echo -e "${YELLOW}[outtake] Setting up FFmpeg MCP server environment...${NC}"
  python3 -m venv "$MCP_DIR/.venv"
  "$MCP_DIR/.venv/bin/pip" install -q -r "$MCP_DIR/requirements.txt"
fi

# ─────────────────────────────────────────────
# 2. Start FFmpeg MCP Server (port 8100)
# ─────────────────────────────────────────────
echo -e "${GREEN}[outtake] Starting FFmpeg MCP Server on :8100...${NC}"
WORKSPACE_ROOT="$PROJECT_ROOT" \
  "$MCP_DIR/.venv/bin/python" "$MCP_DIR/server.py" &
MCP_PID=$!

# Wait for MCP server to be ready
for i in $(seq 1 10); do
  if curl -s http://localhost:8100/mcp >/dev/null 2>&1; then
    echo -e "${GREEN}[outtake] FFmpeg MCP Server ready${NC}"
    break
  fi
  sleep 0.5
done

# ─────────────────────────────────────────────
# 3. Start Next.js App (port 3000)
# ─────────────────────────────────────────────
echo -e "${GREEN}[outtake] Starting Next.js App on :3000...${NC}"
cd "$PROJECT_ROOT/app"
npm run dev &
NEXT_PID=$!

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Outtake is running!${NC}"
echo -e "${GREEN}  App:        http://localhost:3000${NC}"
echo -e "${GREEN}  MCP Server: http://localhost:8100${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

wait
