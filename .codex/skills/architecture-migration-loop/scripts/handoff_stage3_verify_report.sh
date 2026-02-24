#!/usr/bin/env bash
set -euo pipefail

cycle_id="${1:-}"
brief_path="${2:-}"
if [[ -z "$cycle_id" || -z "$brief_path" ]]; then
  echo "usage: handoff_stage3_verify_report.sh <cycle-id> <brief-path>" >&2
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
stage2_response="${handoff_dir}/stage2.response.txt"
response_file="${handoff_dir}/stage3.response.txt"

if [[ ! -f "$session_file" ]]; then
  echo "missing session id; run stage 1 first: ${session_file}" >&2
  exit 2
fi
if [[ ! -f "$stage2_response" ]]; then
  echo "missing stage 2 response; run stage 2 first: ${stage2_response}" >&2
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
You are Executor (Ae), stage 3 of 3: VERIFY + REPORT.

Cycle ID: ${cycle_id}
Planner brief: ${brief_abs}
Prior stage output: ${stage2_response}
Handoff directory: ${handoff_dir}

Instructions:
1) Read the planner brief and stage 2 output.
2) Run or report relevant checks for touched scope.
3) Audit for missed seam sites within touched scope.
4) Return concise verification and handoff notes for planner replanning.

Return sections:
Seam batch:
Incentives changed:
Code changed:
Checks:
Next correction:
EOF
)"

# Opaque handoff boundary: caller signals readiness, then blocks until response is complete.
# // [LAW:one-source-of-truth] Stage 3 resumes the same canonical cycle session.
# // [LAW:verifiable-goals] Verification output is written to a deterministic per-cycle response file.
claude --resume "$session_id" -p "$prompt" > "$response_file"

echo "handoff_complete=stage3"
echo "response_file=${response_file}"
