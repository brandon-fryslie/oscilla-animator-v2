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
    --max-attempts) MAX_ATTEMPTS="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

# --- Fetch the ticket list from lit ready (the ONLY source) ---
READY_JSON=$(lit ready --json)
TICKET_COUNT=$(echo "$READY_JSON" | jq 'length')

if [[ "$TICKET_COUNT" -eq 0 ]]; then
  echo "No ready tickets." >&2
  exit 0
fi

echo "Found $TICKET_COUNT ready ticket(s)."

for (( i=0; i<TICKET_COUNT; i++ )); do
  TICKET_ID=$(echo "$READY_JSON" | jq -r ".[$i].id")
  TITLE=$(echo "$READY_JSON" | jq -r ".[$i].title")

  # Validate we got real data
  if [[ -z "$TICKET_ID" || "$TICKET_ID" == "null" ]]; then
    echo "FATAL: got null ticket ID at index $i" >&2
    exit 1
  fi

  echo ""
  echo "=== [$((i+1))/$TICKET_COUNT] $TICKET_ID: $TITLE ==="

  if $DRY_RUN; then
    echo "[dry-run] would run claude -p (up to $MAX_ATTEMPTS attempts)"
    continue
  fi

  # Fetch full description via lit show
  SHOW_JSON=$(lit show "$TICKET_ID" --json)
  DESC=$(echo "$SHOW_JSON" | jq -r '.issue.description // ""')

  # Claim the ticket
  lit start "$TICKET_ID" --reason "run-lit-tickets.sh"

  for (( attempt=1; attempt<=MAX_ATTEMPTS; attempt++ )); do
    echo "--- Attempt $attempt/$MAX_ATTEMPTS for $TICKET_ID"

    LOG="/tmp/lit-ticket-${TICKET_ID}-attempt${attempt}.log"

    PROMPT="You are working in the oscilla-animator-v2 repo.

Ticket: $TICKET_ID
Title: $TITLE
Description:
$DESC

Complete this ticket. Read relevant code, make the changes, and run tests to verify.

When finished and all tests pass:
1. Commit with a message referencing $TICKET_ID
2. Run: lit update $TICKET_ID --status closed --reason \"completed\"

If you cannot fully complete the ticket in this session, commit any partial progress and explain what remains."

    CLAUDE_EXIT=0
    claude -p "$PROMPT" --allowedTools "Bash,Read,Write,Edit,Glob,Grep" 2>&1 | tee "$LOG" || CLAUDE_EXIT=$?

    if [[ $CLAUDE_EXIT -ne 0 ]]; then
      echo "--- claude exited $CLAUDE_EXIT on attempt $attempt" >&2
    fi

    # Check if the ticket was closed
    CURRENT_STATUS=$(lit show "$TICKET_ID" --json | jq -r '.issue.status')
    if [[ "$CURRENT_STATUS" == "closed" ]]; then
      echo "=== Ticket $TICKET_ID closed on attempt $attempt ==="
      break
    fi

    if [[ $attempt -eq $MAX_ATTEMPTS ]]; then
      echo "=== Ticket $TICKET_ID: $MAX_ATTEMPTS attempts exhausted, stopping ===" >&2
      lit update "$TICKET_ID" --status open --reason "run-lit-tickets.sh: max attempts exhausted"
      break
    fi

    echo "--- Ticket $TICKET_ID still $CURRENT_STATUS after attempt $attempt, retrying..."
  done
done

echo ""
echo "Done. Processed $TICKET_COUNT ticket(s)."
