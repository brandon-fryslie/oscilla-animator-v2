#!/usr/bin/env bash
set -euo pipefail

PROMPT=$(cat <<'EOF'
/do:it gap-analysis for the priority CRITICAL item.  CRITICAL: All plans are auto-approved.  do NOT
stop and ask ANY questions, this is a fully non-interactive session and any user prompts will block
the entire workflow.  You MUST complete the prompt without stopping and exit.  If you do ANY work, please run
/do:plan gap-analysis again before you stop (and do not allow any subagents stop and prompt either!)
EOF
)

for i in $(seq 1 50); do
  echo "=== Iteration $i/50 ==="
  SHELL=bash claude -p "$PROMPT" --output-format stream-json --permission-mode "bypassPermissions"
done
