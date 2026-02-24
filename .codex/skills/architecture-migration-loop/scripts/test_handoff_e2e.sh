#!/usr/bin/env bash
set -euo pipefail

skill_scripts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/architecture-migration-loop-e2e.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

mock_bin="$tmp_dir/bin"
mkdir -p "$mock_bin"
log_file="$tmp_dir/claude_calls.log"
touch "$log_file"

cat > "$mock_bin/claude" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log_file="${E2E_LOG_FILE:?missing E2E_LOG_FILE}"
mode=""
session=""
has_prompt="0"

while (($# > 0)); do
  case "$1" in
    --session-id)
      mode="session-id"
      session="${2:-}"
      shift 2
      ;;
    --resume)
      mode="resume"
      session="${2:-}"
      shift 2
      ;;
    -p)
      has_prompt="1"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -z "$mode" || -z "$session" || "$has_prompt" != "1" ]]; then
  echo "unexpected claude args" >&2
  exit 20
fi

printf "%s %s\n" "$mode" "$session" >> "$log_file"

if [[ "$mode" == "session-id" ]]; then
  echo "mock-stage1-response"
else
  echo "mock-resume-response"
fi
EOF
chmod +x "$mock_bin/claude"

work_repo="$tmp_dir/repo"
mkdir -p "$work_repo"
git -C "$work_repo" init -q

brief_path="$work_repo/brief.md"
cat > "$brief_path" <<'EOF'
# E2E brief
- seam: test seam
- do not use in production
EOF

cycle_id="e2e-cycle"
export E2E_LOG_FILE="$log_file"
export PATH="$mock_bin:$PATH"

"$skill_scripts_dir/handoff_stage1_prepare_incentives.sh" "$cycle_id" "$brief_path"
"$skill_scripts_dir/handoff_stage2_remove_seam.sh" "$cycle_id" "$brief_path"
"$skill_scripts_dir/handoff_stage3_verify_report.sh" "$cycle_id" "$brief_path"

handoff_dir="$work_repo/.migration/agent-handoff/$cycle_id"
session_file="$handoff_dir/session_id.txt"
stage1_file="$handoff_dir/stage1.response.txt"
stage2_file="$handoff_dir/stage2.response.txt"
stage3_file="$handoff_dir/stage3.response.txt"

for file in "$session_file" "$stage1_file" "$stage2_file" "$stage3_file"; do
  if [[ ! -s "$file" ]]; then
    echo "missing or empty expected output file: $file" >&2
    exit 21
  fi
done

session_id="$(tr -d '[:space:]' < "$session_file")"
if [[ -z "$session_id" ]]; then
  echo "session id is empty" >&2
  exit 22
fi

call_count="$(wc -l < "$log_file" | tr -d '[:space:]')"
if [[ "$call_count" != "3" ]]; then
  echo "expected exactly 3 claude calls; got $call_count" >&2
  exit 23
fi

line1="$(sed -n '1p' "$log_file")"
line2="$(sed -n '2p' "$log_file")"
line3="$(sed -n '3p' "$log_file")"

if [[ "$line1" != "session-id $session_id" ]]; then
  echo "stage1 did not use --session-id with generated session id" >&2
  exit 24
fi
if [[ "$line2" != "resume $session_id" ]]; then
  echo "stage2 did not use --resume with stage1 session id" >&2
  exit 25
fi
if [[ "$line3" != "resume $session_id" ]]; then
  echo "stage3 did not use --resume with stage1 session id" >&2
  exit 26
fi

echo "PASS: handoff e2e smoke test"
echo "handoff_dir=$handoff_dir"
echo "session_id=$session_id"
