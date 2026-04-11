#!/usr/bin/env bash
set -euo pipefail

# ─── get-screenshot-of-demo-patch.sh ─────────────────────────────────────────
#
# Captures screenshots of an Oscilla demo patch using headless Chrome.
# By default produces a burst montage showing animation progression.
# Starts its own dev server, takes the screenshot, and shuts everything down.
#
# Requires: Chrome/Chromium, Node.js, ImageMagick (burst mode)
# ─────────────────────────────────────────────────────────────────────────────

APP_PORT="${APP_PORT:-}"
DEFAULT_OUTPUT_DIR="/tmp/oscilla-test-screenshots"

# ─── Colors (only if stderr is a tty) ────────────────────────────────────────

if [[ -t 2 ]]; then
  RED=$'\033[31m' YELLOW=$'\033[33m' GREEN=$'\033[32m' CYAN=$'\033[36m' DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
  RED='' YELLOW='' GREEN='' CYAN='' DIM='' BOLD='' RESET=''
fi

# ─── Defaults ─────────────────────────────────────────────────────────────────

BURST_MODE=false
BURST_COUNT=3
BURST_SIZE=3
BURST_INTERVAL=100
BURST_GAP=1000
BURST_WAIT=0

# ─── Help ─────────────────────────────────────────────────────────────────────

show_help() {
  cat <<'HELP'
Usage: ./scripts/get-screenshot-of-demo-patch.sh <demo-patch> [options]

Captures screenshots of an Oscilla demo patch using headless Chrome.
By default produces a burst montage showing animation progression.

Arguments:
  <demo-patch>              HCL demo filename (e.g., breathing-ring.hcl)

Output:
  --output <path>           Output path (file or directory)
                            Default: /tmp/oscilla-test-screenshots/

Burst Mode (default — produces a labeled montage):
  --no-burst                Single screenshot instead of burst montage
  --burst-count N           Number of burst groups (default: 3)
  --burst-size N            Screenshots per burst (default: 3)
  --burst-interval N        ms between shots within a burst (default: 100, min: 35, max: 500)
  --burst-gap N             ms gap between burst groups (default: 1000)
  --burst-wait N            ms to wait before first burst (default: 0)

  Defaults produce 3 bursts of 3 shots (9 frames) across ~2.6s:
    Burst 1: +0ms    +100ms  +200ms
    Burst 2: +1200ms +1300ms +1400ms
    Burst 3: +2400ms +2500ms +2600ms

  Limits: max 15 total shots, max 10s capture time.
  Invalid combinations revert to defaults with a warning.

  Frame timestamps are recorded from performance.now() inside the browser's
  JS execution context — they reflect actual animation time, not wall-clock.

Examples:
  ./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl
  ./scripts/get-screenshot-of-demo-patch.sh simple.hcl --no-burst
  ./scripts/get-screenshot-of-demo-patch.sh aurora-petal-showcase.hcl --burst-count 5 --burst-size 2
  ./scripts/get-screenshot-of-demo-patch.sh mouse-spiral.hcl --output ./evidence/

Requires: Chrome/Chromium, Node.js, ImageMagick (burst mode)
Set CHROME_BIN to override Chrome location.
HELP
  exit 0
}

# ─── Argument parsing ─────────────────────────────────────────────────────────

DEMO_PATCH=""
OUTPUT=""
HEADLESS=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)        show_help ;;
    --output)         OUTPUT="${2:-}"; shift 2 ;;
    --burst)          BURST_MODE=true; shift ;;
    --burst-count)    BURST_COUNT="${2:-}"; shift 2 ;;
    --burst-size)     BURST_SIZE="${2:-}"; shift 2 ;;
    --burst-interval) BURST_INTERVAL="${2:-}"; shift 2 ;;
    --burst-gap)      BURST_GAP="${2:-}"; shift 2 ;;
    --burst-wait)     BURST_WAIT="${2:-}"; shift 2 ;;
    -*)
      echo "${RED}Error:${RESET} Unknown option: $1 (try --help)" >&2
      exit 1
      ;;
    *)
      if [[ -z "$DEMO_PATCH" ]]; then
        DEMO_PATCH="$1"
      else
        echo "${RED}Error:${RESET} Unexpected argument: $1 (try --help)" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$DEMO_PATCH" ]]; then
  echo "${RED}Error:${RESET} Demo patch filename is required." >&2
  echo "Usage: $0 <demo-patch> [options]  (try --help)" >&2
  exit 1
fi

# ─── Validate burst params ───────────────────────────────────────────────────

reset_burst_defaults() {
  echo "${YELLOW}*** REVERTING to default burst settings:${RESET} 3 bursts of 3, 100ms interval, 1000ms gap, 0ms wait." >&2
  BURST_COUNT=3; BURST_SIZE=3; BURST_INTERVAL=100; BURST_GAP=1000; BURST_WAIT=0
}

if $BURST_MODE; then
  # Ensure all values are positive integers
  for var in BURST_COUNT BURST_SIZE BURST_INTERVAL BURST_GAP BURST_WAIT; do
    val="${!var}"
    if ! [[ "$val" =~ ^[0-9]+$ ]] || (( val <= 0 && var != "BURST_WAIT" )); then
      echo "${YELLOW}*** Invalid $var='$val'.${RESET} Must be a positive integer." >&2
      reset_burst_defaults
      break
    fi
  done

  # Clamp burst interval to reliable range [35ms, 500ms]
  if (( BURST_INTERVAL < 35 )); then
    echo "${YELLOW}*** --burst-interval ${BURST_INTERVAL}ms below minimum.${RESET} Clamping to 35ms." >&2
    BURST_INTERVAL=35
  elif (( BURST_INTERVAL > 500 )); then
    echo "${YELLOW}*** --burst-interval ${BURST_INTERVAL}ms above maximum.${RESET} Clamping to 500ms." >&2
    BURST_INTERVAL=500
  fi

  TOTAL_SHOTS=$((BURST_COUNT * BURST_SIZE))
  # burst_start(b) = BURST_WAIT + b * ((BURST_SIZE-1)*BURST_INTERVAL + BURST_GAP)
  # last shot = burst_start(BURST_COUNT-1) + (BURST_SIZE-1)*BURST_INTERVAL
  LAST_BURST_START=$((BURST_WAIT + (BURST_COUNT - 1) * ((BURST_SIZE - 1) * BURST_INTERVAL + BURST_GAP)))
  TOTAL_CAPTURE_MS=$((LAST_BURST_START + (BURST_SIZE - 1) * BURST_INTERVAL))

  if (( TOTAL_SHOTS > 15 )); then
    echo "${YELLOW}*** Total shots ($TOTAL_SHOTS) exceeds limit of 15.${RESET}" >&2
    reset_burst_defaults
    TOTAL_SHOTS=$((BURST_COUNT * BURST_SIZE))
    LAST_BURST_START=$((BURST_WAIT + (BURST_COUNT - 1) * ((BURST_SIZE - 1) * BURST_INTERVAL + BURST_GAP)))
    TOTAL_CAPTURE_MS=$((LAST_BURST_START + (BURST_SIZE - 1) * BURST_INTERVAL))
  fi

  if (( TOTAL_CAPTURE_MS > 10000 )); then
    echo "${YELLOW}*** Total capture time (${TOTAL_CAPTURE_MS}ms) exceeds limit of 10s.${RESET}" >&2
    reset_burst_defaults
    TOTAL_SHOTS=$((BURST_COUNT * BURST_SIZE))
  fi
fi

# ─── Dev server ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "$APP_PORT" ]]; then
  APP_PORT=5784
fi

DEV_SERVER_PID=""
start_dev_server() {
  cd "$PROJECT_ROOT"
  npm run dev -- --port "$APP_PORT" >/dev/null 2>&1 &
  DEV_SERVER_PID=$!
  cd - >/dev/null

  for i in $(seq 1 100); do
    if curl -fsS --max-time 2 "http://127.0.0.1:${APP_PORT}/" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$DEV_SERVER_PID" 2>/dev/null; then
      echo "${RED}Error:${RESET} Dev server exited unexpectedly." >&2
      exit 1
    fi
    sleep 0.2
  done
  echo "${RED}Error:${RESET} Dev server did not become ready within 20 seconds." >&2
  exit 1
}

stop_dev_server() {
  if [[ -n "$DEV_SERVER_PID" ]]; then
    kill "$DEV_SERVER_PID" 2>/dev/null || true
    wait "$DEV_SERVER_PID" 2>/dev/null || true
  fi
}

start_dev_server

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
  echo "${RED}Error:${RESET} Chrome/Chromium not found. Set ${BOLD}CHROME_BIN${RESET} environment variable." >&2
  exit 1
fi

# ImageMagick check (burst mode only)
MONTAGE_CMD=""
if $BURST_MODE; then
  if command -v montage >/dev/null 2>&1; then
    MONTAGE_CMD="montage"
  elif command -v magick >/dev/null 2>&1; then
    MONTAGE_CMD="magick montage"
  else
    echo "${RED}Error:${RESET} ImageMagick is required for burst montage mode." >&2
    echo "Install it with: ${BOLD}brew install imagemagick${RESET}" >&2
    exit 1
  fi
fi

# ─── Compute frame resolution ────────────────────────────────────────────────
#
# 1:1 aspect ratio (matches canvas rendering). Dynamic sizing keeps total
# montage reasonable by scaling per-frame size to fit a ~1080×1080 grid.
# Single shot: 720×720. Burst: min(720, 1080/max(cols,rows)).

if $BURST_MODE; then
  read -r FRAME_WIDTH FRAME_HEIGHT <<< "$(awk -v bs="$BURST_SIZE" -v bc="$BURST_COUNT" 'BEGIN {
    maxDim = (bs > bc) ? bs : bc
    size = int(1080 / maxDim)
    if (size > 720) size = 720
    size = int(size / 2) * 2
    if (size < 144) size = 144
    printf "%d %d\n", size, size
  }')"
else
  FRAME_WIDTH=720
  FRAME_HEIGHT=720
fi

# ─── Output path ─────────────────────────────────────────────────────────────

DEMO_NAME="${DEMO_PATCH%.hcl}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
if $BURST_MODE; then
  AUTO_FILENAME="${DEMO_NAME}_burst_${BURST_COUNT}x${BURST_SIZE}_${BURST_INTERVAL}ms_${TIMESTAMP}.png"
else
  AUTO_FILENAME="${DEMO_NAME}_${TIMESTAMP}.png"
fi

if [[ -z "$OUTPUT" ]]; then
  mkdir -p "$DEFAULT_OUTPUT_DIR"
  SCREENSHOT_PATH="${DEFAULT_OUTPUT_DIR}/${AUTO_FILENAME}"
elif [[ -d "$OUTPUT" ]]; then
  SCREENSHOT_PATH="${OUTPUT%/}/${AUTO_FILENAME}"
else
  mkdir -p "$(dirname "$OUTPUT")"
  SCREENSHOT_PATH="$OUTPUT"
fi

# ─── Print settings ──────────────────────────────────────────────────────────

if $BURST_MODE; then
  printf "${DIM}%-12s${RESET} %s\n" "Demo:" "${CYAN}${DEMO_PATCH}${RESET}" >&2
  printf "${DIM}%-12s${RESET} %s\n" "Viewport:" "${FRAME_WIDTH}x${FRAME_HEIGHT}" >&2
  printf "${DIM}%-12s${RESET} %s\n" "Burst:" "${BOLD}${BURST_COUNT}x${BURST_SIZE}${RESET} @ ${BURST_INTERVAL}ms" >&2
  printf "${DIM}%-12s${RESET} %s\n" "Gap:" "${BURST_GAP}ms" >&2
  printf "${DIM}%-12s${RESET} %s\n" "Wait:" "${BURST_WAIT}ms" >&2
  printf "${DIM}%-12s${RESET} %s\n" "Total:" "${BOLD}${TOTAL_SHOTS} frames${RESET}" >&2
else
  printf "${DIM}%-12s${RESET} %s\n" "Demo:" "${CYAN}${DEMO_PATCH}${RESET}" >&2
  printf "${DIM}%-12s${RESET} %s\n" "Viewport:" "${FRAME_WIDTH}x${FRAME_HEIGHT}" >&2
  printf "${DIM}%-12s${RESET} %s\n" "Mode:" "Single shot" >&2
fi

# ─── Launch Chrome ────────────────────────────────────────────────────────────

PROFILE_DIR="$(mktemp -d)"
FRAME_DIR="$(mktemp -d)"
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
  stop_dev_server
  rm -rf "$PROFILE_DIR" "$FRAME_DIR"
}
trap cleanup EXIT

# ─── Wait for Chrome ─────────────────────────────────────────────────────────

for i in $(seq 1 50); do
  if curl -s "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null 2>&1; then
    break
  fi
  if [[ $i -eq 50 ]]; then
    echo "${RED}Error:${RESET} Chrome did not start within 10 seconds." >&2
    exit 1
  fi
  sleep 0.2
done

# ─── Run CDP capture ─────────────────────────────────────────────────────────

APP_URL="http://localhost:${APP_PORT}/?loadDemoPatch=${DEMO_PATCH}&showPreview=true"

if $BURST_MODE; then
  BURST_JSON="{\"wait\":${BURST_WAIT},\"count\":${BURST_COUNT},\"size\":${BURST_SIZE},\"interval\":${BURST_INTERVAL},\"gap\":${BURST_GAP}}"
else
  BURST_JSON="{\"wait\":0,\"count\":1,\"size\":1,\"interval\":0,\"gap\":0}"
fi

MANIFEST="$(mktemp)"
node "${SCRIPT_DIR}/_get-screenshot-cdp.mjs" \
  "$DEBUG_PORT" "$APP_URL" "$FRAME_DIR" "$FRAME_WIDTH" "$FRAME_HEIGHT" "$BURST_JSON" \
  > "$MANIFEST"

# ─── Assemble output ─────────────────────────────────────────────────────────

FRAME_COUNT=$(wc -l < "$MANIFEST" | tr -d ' ')

if (( FRAME_COUNT == 0 )); then
  echo "${RED}Error:${RESET} No frames captured." >&2
  rm -f "$MANIFEST"
  exit 1
fi

if $BURST_MODE && (( FRAME_COUNT > 1 )); then
  # Build montage — timing labels are already burned into each frame by the browser
  PAD=$(awk -v w="$FRAME_WIDTH" 'BEGIN { v=int(w/100); if(v<2)v=2; if(v>8)v=8; print v }')

  FRAME_PATHS=()
  while IFS=$'\t' read -r frame_path _delta_ms; do
    FRAME_PATHS+=("$frame_path")
  done < "$MANIFEST"

  $MONTAGE_CMD \
    "${FRAME_PATHS[@]}" \
    -tile "${BURST_SIZE}x${BURST_COUNT}" \
    -geometry "${FRAME_WIDTH}x${FRAME_HEIGHT}+${PAD}+${PAD}" \
    -background '#1a1a2e' \
    "$SCREENSHOT_PATH" 2> >(grep -v -e "delegate library support not built-in 'none' (Freetype)" -e 'geometry does not contain image' >&2)
else
  # Single frame — move directly
  SINGLE_PATH="$(head -1 "$MANIFEST" | cut -f1)"
  mv "$SINGLE_PATH" "$SCREENSHOT_PATH"
fi

rm -f "$MANIFEST"

echo "${GREEN}Screenshot path:${RESET}" >&2
echo "${SCREENSHOT_PATH}"
