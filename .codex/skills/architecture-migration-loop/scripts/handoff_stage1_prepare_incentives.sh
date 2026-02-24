#!/usr/bin/env bash
set -euo pipefail

cycle_id="${1:-}"
brief_path="${2:-}"
if [[ -z "$cycle_id" || -z "$brief_path" ]]; then
  echo "usage: handoff_stage1_prepare_incentives.sh <cycle-id> <brief-path>" >&2
  exit 2
fi

if [[ ! -f "$brief_path" ]]; then
  echo "brief file not found: ${brief_path}" >&2
  exit 2
fi

brief_abs="$(cd "$(dirname "$brief_path")" && pwd)/$(basename "$brief_path")"
repo_root="$(git -C "$(dirname "$brief_abs")" rev-parse --show-toplevel 2>/dev/null || pwd)"
handoff_dir="${repo_root}/.migration/agent-handoff/${cycle_id}"
session_file="${handoff_dir}/session_id.txt"
response_file="${handoff_dir}/stage1.response.txt"
mkdir -p "$handoff_dir"

if ! command -v uuidgen >/dev/null 2>&1; then
  echo "uuidgen is required but not found in PATH" >&2
  exit 2
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "claude is required but not found in PATH" >&2
  exit 2
fi

session_id="$(uuidgen)"
printf "%s\n" "$session_id" > "$session_file"

prompt="$(cat <<EOF
You are Executor (Ae), stage 1 of 3: PREPARE INCENTIVES ONLY.

Cycle ID: ${cycle_id}
Planner brief: ${brief_abs}
Handoff directory: ${handoff_dir}

Instructions:
1) Read the planner brief.
2) Implement incentive changes first (tests/checks/guards that block old seam behavior and encourage canonical path).
3) Do NOT remove seam production code in this stage.
4) Keep edits scoped to what is required for stage 1.
5) Produce a concise report with exact files changed and any blockers for stage 2.

Return sections:
Seam batch:
Incentives changed:
Code changed:
Checks:
Next correction:
EOF
)"

# Opaque handoff boundary: caller signals readiness, then blocks until response is complete.
# // [LAW:one-source-of-truth] Stage 1 creates one canonical session id for this cycle.
# // [LAW:verifiable-goals] Stage output is written to a deterministic per-cycle response file.
claude --session-id "$session_id" -p "$prompt" > "$response_file"

echo "handoff_complete=stage1"
echo "response_file=${response_file}"
