#!/usr/bin/env bash
set -euo pipefail

# ─── get-screenshot-of-payload-tester.sh ─────────────────────────────────────
#
# Captures a screenshot of the payload tester after submitting a fixture.
# Adapted from get-screenshot-of-demo-patch.sh for the standalone tester app.
#
# Requires: Chrome/Chromium, Node.js, dev server running
# ─────────────────────────────────────────────────────────────────────────────

APP_PORT="${APP_PORT:-}"
DEFAULT_OUTPUT_DIR="/tmp/oscilla-test-screenshots"

if [[ -t 2 ]]; then
  RED=$'\033[31m' YELLOW=$'\033[33m' GREEN=$'\033[32m' CYAN=$'\033[36m' DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
  RED='' YELLOW='' GREEN='' CYAN='' DIM='' BOLD='' RESET=''
fi

# ─── Defaults ─────────────────────────────────────────────────────────────────

FIXTURE_INDEX=0
FRAME_WIDTH=720
FRAME_HEIGHT=720

# ─── Help ─────────────────────────────────────────────────────────────────────

show_help() {
  cat <<'HELP'
Usage: ./scripts/get-screenshot-of-payload-tester.sh [options]

Captures a screenshot of the payload tester after submitting a fixture.
Boots the standalone payload tester (no main app), waits for the Naga
shim + renderer to be ready, clicks a fixture, submits it, and captures.

Options:
  --fixture N               Zero-indexed fixture to submit (default: 0)
  --output <path>           Output path (file or directory)
  --no-headless             Show the browser window

Examples:
  ./scripts/get-screenshot-of-payload-tester.sh
  ./scripts/get-screenshot-of-payload-tester.sh --fixture 1
  ./scripts/get-screenshot-of-payload-tester.sh --output ./evidence/
HELP
  exit 0
}

# ─── Argument parsing ────────────────────────────────────────────────────────

OUTPUT=""
HEADLESS=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)        show_help ;;
    --output)         OUTPUT="${2:-}"; shift 2 ;;
    --fixture)        FIXTURE_INDEX="${2:-0}"; shift 2 ;;
    --no-headless)    HEADLESS=false; shift ;;
    *)
      echo "${RED}Error:${RESET} Unknown option: $1 (try --help)" >&2
      exit 1
      ;;
  esac
done

# ─── Dev server detection ───────────────────────────────────────────────────

declare -a APP_PORT_CANDIDATES=()
if [[ -n "$APP_PORT" ]]; then
  APP_PORT_CANDIDATES=("$APP_PORT")
else
  APP_PORT_CANDIDATES=(5784 5785 5786)
fi

SELECTED_APP_PORT=""
for candidate in "${APP_PORT_CANDIDATES[@]}"; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${candidate}/payload-tester.html" >/dev/null 2>&1; then
    SELECTED_APP_PORT="$candidate"
    break
  fi
done

if [[ -z "$SELECTED_APP_PORT" ]]; then
  echo "${RED}Error:${RESET} No dev server found serving payload-tester.html." >&2
  echo "Start with: ${BOLD}npm run dev${RESET}" >&2
  exit 1
fi
APP_PORT="$SELECTED_APP_PORT"

# ─── Chrome ────────────────────────────────────────────────────────────────

find_chrome() {
  if [[ -n "${CHROME_BIN:-}" ]]; then echo "$CHROME_BIN"; return; fi
  local candidates=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "google-chrome" "google-chrome-stable" "chromium-browser" "chromium"
  )
  for c in "${candidates[@]}"; do
    if command -v "$c" >/dev/null 2>&1 || [[ -x "$c" ]]; then echo "$c"; return; fi
  done
  echo ""
}

CHROME="$(find_chrome)"
if [[ -z "$CHROME" ]]; then
  echo "${RED}Error:${RESET} Chrome/Chromium not found. Set ${BOLD}CHROME_BIN${RESET}." >&2
  exit 1
fi

# ─── Output path ─────────────────────────────────────────────────────────────

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
AUTO_FILENAME="payload-tester_fixture${FIXTURE_INDEX}_${TIMESTAMP}.png"

if [[ -z "$OUTPUT" ]]; then
  mkdir -p "$DEFAULT_OUTPUT_DIR"
  SCREENSHOT_PATH="${DEFAULT_OUTPUT_DIR}/${AUTO_FILENAME}"
elif [[ -d "$OUTPUT" ]]; then
  SCREENSHOT_PATH="${OUTPUT%/}/${AUTO_FILENAME}"
else
  mkdir -p "$(dirname "$OUTPUT")"
  SCREENSHOT_PATH="$OUTPUT"
fi

# ─── Print settings ────────────────────────────────────────────────────────

printf "${DIM}%-12s${RESET} %s\n" "Fixture:" "${CYAN}#${FIXTURE_INDEX}${RESET}" >&2
printf "${DIM}%-12s${RESET} %s\n" "Viewport:" "${FRAME_WIDTH}x${FRAME_HEIGHT}" >&2
printf "${DIM}%-12s${RESET} %s\n" "Port:" "${APP_PORT}" >&2

# ─── Launch Chrome ────────────────────────────────────────────────────────────

PROFILE_DIR="$(mktemp -d)"
DEBUG_PORT=$((9222 + RANDOM % 1000))

HEADLESS_FLAGS=()
if $HEADLESS; then
  HEADLESS_FLAGS+=("--headless=new")
fi

GPU_FLAGS=(
  "--enable-unsafe-webgpu"
  "--enable-webgpu-developer-features"
)
if [[ "$(uname -s)" == "Darwin" ]]; then
  GPU_FLAGS+=("--use-angle=metal")
fi

"$CHROME" \
  "${HEADLESS_FLAGS[@]}" \
  "${GPU_FLAGS[@]}" \
  --remote-debugging-port="$DEBUG_PORT" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions \
  --disable-popup-blocking \
  --disable-translate \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --window-size=${FRAME_WIDTH},${FRAME_HEIGHT} \
  "about:blank" \
  >/dev/null 2>&1 &

CHROME_PID=$!

cleanup() {
  kill "$CHROME_PID" 2>/dev/null || true
  wait "$CHROME_PID" 2>/dev/null || true
  rm -rf "$PROFILE_DIR"
}
trap cleanup EXIT

# Wait for Chrome
for i in $(seq 1 50); do
  if curl -s "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null 2>&1; then break; fi
  if [[ $i -eq 50 ]]; then echo "${RED}Error:${RESET} Chrome did not start." >&2; exit 1; fi
  sleep 0.2
done

# ─── CDP capture ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_URL="http://localhost:${APP_PORT}/payload-tester.html"

node "${SCRIPT_DIR}/_payload-tester-cdp.mjs" \
  "$DEBUG_PORT" "$APP_URL" "$SCREENSHOT_PATH" "$FRAME_WIDTH" "$FRAME_HEIGHT" "$FIXTURE_INDEX"

echo "${GREEN}Screenshot path:${RESET}" >&2
echo "$SCREENSHOT_PATH"
