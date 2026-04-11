#!/usr/bin/env bash
set -euo pipefail

# ─── validate-fixture-switching.sh ───────────────────────────────────────────
#
# Validates that switching between fixtures in the payload tester actually works:
# loads fixture A, screenshots, switches to fixture B, screenshots, then
# compares the two images with ImageMagick to confirm they differ.
#
# Exit 0 = fixtures are visually different (switching works)
# Exit 1 = fixtures are identical or an error occurred (switching is broken)
#
# Requires: Chrome/Chromium, Node.js, ImageMagick (compare), dev server running
# ─────────────────────────────────────────────────────────────────────────────

APP_PORT="${APP_PORT:-}"
DEFAULT_OUTPUT_DIR="/tmp/oscilla-test-screenshots/fixture-switch"

if [[ -t 2 ]]; then
  RED=$'\033[31m' YELLOW=$'\033[33m' GREEN=$'\033[32m' CYAN=$'\033[36m' DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
  RED='' YELLOW='' GREEN='' CYAN='' DIM='' BOLD='' RESET=''
fi

# ─── Fixed fixture pair (maximally different) ────────────────────────────────
#
# hash-color: static 8x8 grid of colored quads on dark gray background
# galaxy-swirl: 16384 animated stars on near-black background
# These fixtures share zero visual characteristics — different particle count,
# layout, color palette, background, and motion. Any ImageMagick metric will
# give a decisive answer.

FIXTURE_A="hash-color"
FIXTURE_A_DISPLAY="Hash Colors"
FIXTURE_B="galaxy-swirl"
FIXTURE_B_DISPLAY="Galaxy Swirl"

FRAME_WIDTH=720
FRAME_HEIGHT=720

# ─── Help ────────────────────────────────────────────────────────────────────

show_help() {
  cat <<'HELP'
Usage: ./scripts/validate-fixture-switching.sh [options]

Validates that fixture switching works by loading two different fixtures
and comparing screenshots with ImageMagick.

Fixtures used: hash-color → galaxy-swirl (maximally different)

Options:
  --output <dir>            Output directory for screenshots (default: /tmp/oscilla-test-screenshots/fixture-switch)
  --no-headless             Show the browser window
  --help                    Show this help

Exit codes:
  0   Fixtures differ (switching works correctly)
  1   Error or fixtures are identical (switching is broken)
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
    --no-headless)    HEADLESS=false; shift ;;
    -*)
      echo "${RED}Error:${RESET} Unknown option: $1 (try --help)" >&2
      exit 1
      ;;
    *)
      echo "${RED}Error:${RESET} Unexpected argument: $1" >&2; exit 1
      ;;
  esac
done

# ─── Prerequisite check: ImageMagick ─────────────────────────────────────────

if ! command -v compare >/dev/null 2>&1; then
  echo "${RED}Error:${RESET} ImageMagick 'compare' command not found." >&2
  echo "Install with: ${BOLD}brew install imagemagick${RESET}" >&2
  exit 1
fi

# ─── Dev server detection ────────────────────────────────────────────────────

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

# ─── Chrome ──────────────────────────────────────────────────────────────────

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

# ─── Output paths ────────────────────────────────────────────────────────────

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -z "$OUTPUT" ]]; then
  OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"
else
  OUTPUT_DIR="$OUTPUT"
fi

mkdir -p "$OUTPUT_DIR"
SCREENSHOT_A="${OUTPUT_DIR}/${FIXTURE_A}_${TIMESTAMP}.png"
SCREENSHOT_B="${OUTPUT_DIR}/${FIXTURE_B}_${TIMESTAMP}.png"
DIFF_IMAGE="${OUTPUT_DIR}/diff_${TIMESTAMP}.png"

# ─── Print settings ──────────────────────────────────────────────────────────

echo "" >&2
echo "${BOLD}Fixture Switching Validation${RESET}" >&2
echo "${DIM}────────────────────────────────────────────${RESET}" >&2
printf "${DIM}%-12s${RESET} %s → %s\n" "Fixtures:" "${CYAN}${FIXTURE_A}${RESET}" "${CYAN}${FIXTURE_B}${RESET}" >&2
printf "${DIM}%-12s${RESET} %s\n" "Viewport:" "${FRAME_WIDTH}x${FRAME_HEIGHT}" >&2
printf "${DIM}%-12s${RESET} %s\n" "Port:" "${APP_PORT}" >&2
printf "${DIM}%-12s${RESET} %s\n" "Output:" "${OUTPUT_DIR}" >&2
echo "" >&2

# ─── Launch Chrome ───────────────────────────────────────────────────────────

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

# ─── CDP capture (both fixtures, one session) ────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Navigate to fixture A via query param (NOT canvas-only — we need the sidebar
# to click fixture B, so we use the full UI).
APP_URL="http://localhost:${APP_PORT}/payload-tester.html?fixture=${FIXTURE_A}"

echo "${DIM}Step 1:${RESET} Loading ${CYAN}${FIXTURE_A}${RESET}, capturing screenshot..." >&2
echo "${DIM}Step 2:${RESET} Clicking ${CYAN}${FIXTURE_B}${RESET} in sidebar..." >&2
echo "${DIM}Step 3:${RESET} Capturing second screenshot..." >&2
echo "" >&2

node "${SCRIPT_DIR}/_fixture-switch-cdp.mjs" \
  "$DEBUG_PORT" "$APP_URL" "$FIXTURE_B_DISPLAY" \
  "$SCREENSHOT_A" "$SCREENSHOT_B" \
  "$FRAME_WIDTH" "$FRAME_HEIGHT"

# ─── ImageMagick comparison ──────────────────────────────────────────────────
#
# compare -metric AE (Absolute Error): counts the number of pixels that differ.
# Two completely different fixtures should have thousands of differing pixels.
# A threshold of 100 pixels accounts for anti-aliasing or minor rendering jitter.

echo "" >&2
echo "${BOLD}ImageMagick Comparison${RESET}" >&2
echo "${DIM}────────────────────────────────────────────${RESET}" >&2

# compare writes the metric to stderr and the diff image to stdout (or a file).
# Output format varies: "12345" or "12345 (0.345912)". Extract the first number.
RAW_DIFF=$(compare -metric AE "$SCREENSHOT_A" "$SCREENSHOT_B" "$DIFF_IMAGE" 2>&1 || true)
PIXEL_DIFF=$(echo "$RAW_DIFF" | grep -oE '^[0-9]+')

if [[ -z "$PIXEL_DIFF" ]]; then
  echo "${RED}Error:${RESET} Could not parse compare output: ${RAW_DIFF}" >&2
  exit 1
fi

PIXEL_DIFF_INT=$PIXEL_DIFF

printf "${DIM}%-16s${RESET} %s\n" "Screenshot A:" "$SCREENSHOT_A" >&2
printf "${DIM}%-16s${RESET} %s\n" "Screenshot B:" "$SCREENSHOT_B" >&2
printf "${DIM}%-16s${RESET} %s\n" "Diff image:" "$DIFF_IMAGE" >&2
printf "${DIM}%-16s${RESET} %s pixels\n" "Pixel diff:" "$PIXEL_DIFF_INT" >&2
echo "" >&2

THRESHOLD=100

if [[ "$PIXEL_DIFF_INT" -le "$THRESHOLD" ]]; then
  echo "${RED}FAIL:${RESET} Fixtures are visually identical (${PIXEL_DIFF_INT} pixels differ, threshold: ${THRESHOLD})." >&2
  echo "Fixture switching is broken — the second fixture did not render." >&2
  exit 1
else
  echo "${GREEN}PASS:${RESET} Fixtures are visually different (${PIXEL_DIFF_INT} pixels differ)." >&2
  echo "Fixture switching works correctly." >&2
  exit 0
fi
