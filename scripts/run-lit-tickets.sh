#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  local exit_code=$1
  local previous_command=$BASH_COMMAND
  [[ $exit_code -ne 0 ]] && [[ ! $previous_command =~ exit* ]] && echo "INFO: Script exited with code $exit_code from command $previous_command"
  exit $exit_code
}
trap 'cleanup $?' EXIT

# Process lit tickets one at a time with claude -p.
# Uses `lit ready` as the single source of truth for ordering (respects blocked-by).
# Fails loud on any lit CLI error.
#
# Usage: ./scripts/run-lit-tickets.sh [--dry-run] [--max-attempts N]

DRY_RUN=false
MAX_ATTEMPTS=3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --max-attempts)
      if [[ $# -lt 2 ]] || [[ -z "${2:-}" ]]; then
        echo "Missing value for --max-attempts (expected a positive integer)" >&2
        exit 2
      fi
      if ! [[ "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Invalid value for --max-attempts: $2 (must be a positive integer)" >&2
        exit 2
      fi
      MAX_ATTEMPTS="$2"
      shift 2
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

# --- Pull one ticket at a time from `lit ready` each iteration ---
PROCESSED=0

while true; do
  # Grab header + first ready ticket
  READY_HEAD=$(lit ready | head -n 2)
  TICKET_LINE=$(echo "$READY_HEAD" | sed -n '2p')

  if [[ -z "$TICKET_LINE" ]]; then
    echo "No more ready tickets."
    break
  fi

  PROCESSED=$((PROCESSED + 1))
  echo ""
  echo "=== [#$PROCESSED] Next ticket from lit ready ==="
  echo "$READY_HEAD"

  if $DRY_RUN; then
    echo "[dry-run] would run claude -p (up to $MAX_ATTEMPTS attempts)"
    continue
  fi

  LOG="/tmp/lit-ticket-${PROCESSED}.log"

  PROMPT="You are working in the oscilla-animator-v2 repo.

Here is the output of lit ready (header + first ticket):
$READY_HEAD

Complete this ticket:
1. Use lit show <ticket-id> --json to get the full description
2. Read relevant code, make the changes, and run tests to verify
3. When finished and all tests pass, commit with a message referencing the ticket ID
4. Run: lit close <ticket-id> --reason \"completed\"

If you cannot fully complete the ticket in this session, commit any partial progress and explain what remains."

  CLAUDE_EXIT=0
  cc-jstream --color --logfile "${LOG}" claude -p "$PROMPT"
  CLAUDE_EXIT=$?

  if [[ $CLAUDE_EXIT -ne 0 ]]; then
    echo "--- claude exited $CLAUDE_EXIT" >&2
  fi
done

echo ""
echo "Done. Processed $PROCESSED ticket(s)."
