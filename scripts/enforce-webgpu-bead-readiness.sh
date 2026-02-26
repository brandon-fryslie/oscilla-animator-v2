#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! command -v bd >/dev/null 2>&1; then
  echo "ERROR: bd is required for WebGPU bead readiness enforcement." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required for WebGPU bead readiness enforcement." >&2
  exit 1
fi

STAGED="$(git diff --cached --name-only)"
if [ -z "$STAGED" ]; then
  exit 0
fi

is_webgpu_scope() {
  case "$1" in
    docs/WebGPU-Complete/*|src/render/webgpu/*|src/compiler/*|src/runtime/*|src/services/*|src/events/*|src/__tests__/*|scripts/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

NEEDS_GATE=0
while IFS= read -r path; do
  if is_webgpu_scope "$path"; then
    NEEDS_GATE=1
    break
  fi
done <<< "$STAGED"

if [ "$NEEDS_GATE" -eq 0 ]; then
  exit 0
fi

if [ ! -f "docs/WebGPU-Complete/AGENTS.md" ]; then
  echo "ERROR: Missing docs/WebGPU-Complete/AGENTS.md (mandatory preflight context)." >&2
  exit 1
fi

if [ -z "${BEAD_ID:-}" ]; then
  echo "ERROR: BEAD_ID is required for WebGPU-scope commits." >&2
  echo "Set BEAD_ID to an issue from bd ready, then retry." >&2
  exit 1
fi

DB_PATH="${BEADS_DB:-}"
if [ -z "$DB_PATH" ]; then
  DB_PATH="$(bd where --json | jq -r '.database_path')"
fi

ISSUE_JSON="$(bd --db "$DB_PATH" show "$BEAD_ID" --json 2>/dev/null || true)"
if [ -z "$ISSUE_JSON" ] || [ "$(echo "$ISSUE_JSON" | jq 'length')" -eq 0 ]; then
  echo "ERROR: BEAD_ID '$BEAD_ID' was not found in $DB_PATH." >&2
  exit 1
fi

ISSUE_STATUS="$(echo "$ISSUE_JSON" | jq -r '.[0].status')"
if [ "$ISSUE_STATUS" = "closed" ]; then
  echo "ERROR: BEAD_ID '$BEAD_ID' is closed." >&2
  exit 1
fi

BLOCKERS="$(echo "$ISSUE_JSON" | jq -r '.[0].dependencies[]? | select(.dependency_type == "blocks" and .status != "closed") | "\(.id) (\(.status))"')"
if [ -n "$BLOCKERS" ]; then
  echo "ERROR: BEAD_ID '$BEAD_ID' has open blocking dependencies:" >&2
  echo "$BLOCKERS" >&2
  exit 1
fi

if ! bd --db "$DB_PATH" ready --json --limit 5000 | jq -e --arg id "$BEAD_ID" 'map(.id) | index($id) != null' >/dev/null; then
  echo "ERROR: BEAD_ID '$BEAD_ID' is not currently ready." >&2
  echo "Use: bd --db \"$DB_PATH\" ready --json | jq -r '.[].id'" >&2
  exit 1
fi

exit 0
