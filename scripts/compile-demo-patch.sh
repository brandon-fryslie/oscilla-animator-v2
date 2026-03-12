#!/usr/bin/env bash
set -euo pipefail

# Compile-check HCL demos via canonical vitest coverage.
# Usage:
#   ./scripts/compile-demo-patch.sh all
#   ./scripts/compile-demo-patch.sh golden-spiral.hcl
#   ./scripts/compile-demo-patch.sh golden-spiral

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_FILE="src/demo/hcl/__tests__/hcl-demos.test.ts"

target="${1:-all}"
if [[ "$target" == "all" ]]; then
  echo "Compiling all demo patches..."
  pnpm -s vitest run "$TEST_FILE" --testNamePattern "compiles without errors"
  echo "OK: all demo patches compile."
  exit 0
fi

if [[ "$target" != *.hcl ]]; then
  target="${target}.hcl"
fi

demo_path="$ROOT_DIR/src/demo/hcl/$target"
if [[ ! -f "$demo_path" ]]; then
  echo "Error: demo patch not found: $target" >&2
  exit 1
fi

echo "Compiling demo patch: $target"
DEMO_FILTER="$target" pnpm -s vitest run "$TEST_FILE" --testNamePattern "compiles without errors"
echo "OK: ${target} compiles."
