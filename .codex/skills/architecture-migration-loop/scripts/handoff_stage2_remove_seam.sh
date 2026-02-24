#!/usr/bin/env bash
set -euo pipefail

cycle_id="${1:-}"
brief_path="${2:-}"
if [[ -z "$cycle_id" || -z "$brief_path" ]]; then
  echo "usage: handoff_stage2_remove_seam.sh <cycle-id> <brief-path>" >&2
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
stage1_response="${handoff_dir}/stage1.response.txt"
response_file="${handoff_dir}/stage2.response.txt"

if [[ ! -f "$session_file" ]]; then
  echo "missing session id; run stage 1 first: ${session_file}" >&2
  exit 2
fi
if [[ ! -f "$stage1_response" ]]; then
  echo "missing stage 1 response; run stage 1 first: ${stage1_response}" >&2
  exit 2
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "claude is required but not found in PATH" >&2
  exit 2
fi

session_id="$(tr -d '[:space:]' < "$session_file")"
if [[ -z "$session_id" ]]; then
  echo "session id file is empty: ${session_file}" >&2
  exit 2
fi

prompt="$(cat <<EOF
You are Executor (Ae), stage 2 of 3: REMOVE SEAM CODE.

Cycle ID: ${cycle_id}
Planner brief: ${brief_abs}
Prior stage output: ${stage1_response}
Handoff directory: ${handoff_dir}

Instructions:
1) Read the planner brief and prior stage output.
2) Remove seam code in production modules according to the brief.
3) Do not reintroduce compatibility shims in core modules.
4) Keep edits scoped to this seam batch and stage goal.
5) Produce a concise report with exact files changed and remaining blockers for stage 3.

Return sections:
Seam batch:
Incentives changed:
Code changed:
Checks:
Next correction:
EOF
)"

# Opaque handoff boundary: caller signals readiness, then blocks until response is complete.
# // [LAW:one-source-of-truth] Stage 2 resumes the single canonical cycle session from stage 1.
# // [LAW:verifiable-goals] Stage output is written to a deterministic per-cycle response file.
claude --resume "$session_id" -p "$prompt" > "$response_file"

echo "handoff_complete=stage2"
echo "response_file=${response_file}"
