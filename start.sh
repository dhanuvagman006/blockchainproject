#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  start.sh  —  Launch backend (FastAPI/uvicorn) + frontend (React) together
#  Usage: ./start.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend-app"
VENV_DIR="$SCRIPT_DIR/venv"

# ── Colors ─────────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
MAGENTA="\033[1;35m"
DIM="\033[2m"

# ── PIDs for cleanup ────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

# ── Cleanup on exit / Ctrl-C ────────────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}${BOLD}⏹  Shutting down…${RESET}"
    [[ -n "$BACKEND_PID"  ]] && kill "$BACKEND_PID"  2>/dev/null && echo -e "   ${DIM}Backend  stopped (PID $BACKEND_PID)${RESET}"
    [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null && echo -e "   ${DIM}Frontend stopped (PID $FRONTEND_PID)${RESET}"
    # Kill any child processes that may have been spawned
    jobs -p | xargs -r kill 2>/dev/null || true
    echo -e "${GREEN}✓ All services stopped.${RESET}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║   ML-Integrated Private Blockchain — Dev Server           ║${RESET}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Preflight checks ────────────────────────────────────────────────────────
echo -e "${BOLD}[1/3] Running preflight checks…${RESET}"

# Python venv
if [[ -f "$VENV_DIR/bin/python" ]]; then
    PYTHON="$VENV_DIR/bin/python"
    PIP="$VENV_DIR/bin/pip"
    UVICORN="$VENV_DIR/bin/uvicorn"
    echo -e "   ${GREEN}✓${RESET} Virtual environment found at ${DIM}venv/${RESET}"
else
    PYTHON="python3"
    UVICORN="uvicorn"
    echo -e "   ${YELLOW}⚠${RESET}  No venv found — using system Python (${DIM}$(which python3)${RESET})"
fi

if ! command -v "$UVICORN" &>/dev/null && ! "$PYTHON" -m uvicorn --version &>/dev/null 2>&1; then
    echo -e "   ${RED}✗  uvicorn not found. Install it: pip install uvicorn${RESET}"
    exit 1
fi

# Node / npm
if ! command -v npm &>/dev/null; then
    echo -e "   ${RED}✗  npm not found. Install Node.js first.${RESET}"
    exit 1
fi
echo -e "   ${GREEN}✓${RESET} npm found ($(npm --version))"

# node_modules
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo -e "   ${YELLOW}⚠${RESET}  node_modules missing — installing dependencies…"
    (cd "$FRONTEND_DIR" && npm install --silent)
    echo -e "   ${GREEN}✓${RESET} Dependencies installed"
fi

echo ""

# ── Start Backend ───────────────────────────────────────────────────────────
echo -e "${BOLD}[2/3] Starting backend  ${DIM}→  http://localhost:8000${RESET}${BOLD}  (FastAPI / uvicorn)${RESET}"

# Prefix every backend log line with a colored tag
(
    cd "$SCRIPT_DIR"
    if [[ -f "$VENV_DIR/bin/uvicorn" ]]; then
        "$VENV_DIR/bin/uvicorn" backend.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            --reload \
            --reload-dir "$SCRIPT_DIR/backend" \
            --reload-dir "$SCRIPT_DIR/blockchain" \
            --reload-dir "$SCRIPT_DIR/ml" \
            2>&1 | sed "s/^/$(echo -e "${MAGENTA}[backend] ${RESET}")/"
    else
        "$PYTHON" -m uvicorn backend.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            --reload \
            2>&1 | sed "s/^/$(echo -e "${MAGENTA}[backend] ${RESET}")/"
    fi
) &
BACKEND_PID=$!

# Wait briefly then check the backend started
sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo -e "${RED}✗  Backend failed to start. Check logs above.${RESET}"
    exit 1
fi
echo -e "   ${GREEN}✓${RESET} Backend running  (PID ${BACKEND_PID})"
echo ""

# ── Start Frontend ──────────────────────────────────────────────────────────
echo -e "${BOLD}[3/3] Starting frontend ${DIM}→  http://localhost:3000${RESET}${BOLD}  (React / CRA)${RESET}"

(
    cd "$FRONTEND_DIR"
    BROWSER=none npm start 2>&1 | sed "s/^/$(echo -e "${CYAN}[frontend]${RESET} ")/"
) &
FRONTEND_PID=$!

sleep 2
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo -e "${RED}✗  Frontend failed to start. Check logs above.${RESET}"
    exit 1
fi
echo -e "   ${GREEN}✓${RESET} Frontend running (PID ${FRONTEND_PID})"
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║  ✅  Both services are up!                                ║${RESET}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}${BOLD}║  Backend  API  →  http://localhost:8000                   ║${RESET}"
echo -e "${GREEN}${BOLD}║  API Docs      →  http://localhost:8000/docs              ║${RESET}"
echo -e "${GREEN}${BOLD}║  Frontend UI   →  http://localhost:3000                   ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${DIM}Press Ctrl+C to stop all services.${RESET}"
echo ""

# ── Wait ─────────────────────────────────────────────────────────────────────
wait
