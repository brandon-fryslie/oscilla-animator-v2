#!/usr/bin/env bash
# Skill implementation: Refresh stale document indexes
# Called by the skill invocation system with optional arguments

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

# Parse arguments
# Usage: refresh-indexes [file1.md] [file2.md] ...
# If no args, auto-detect stale indexes

if [[ $# -eq 0 ]]; then
    # Auto-detect stale indexes
    echo "🔍 Detecting stale indexes..."
    echo ""

    validation_output=$("$REPO_ROOT/scripts/validate-indexes.sh" 2>&1 || true)

    # Extract stale source files from validation output
    # Format: "❌ {index_file} - STALE" with "Source:  {source_path}" on next line
    stale_sources=$(echo "$validation_output" | grep -A1 "^❌.*STALE" | grep "Source:" | sed 's/.*Source: *//' || true)

    if [[ -z "$stale_sources" ]]; then
        echo "✅ All indexes are fresh"
        exit 0
    fi
else
    # User specified specific files to refresh
    stale_sources=""
    for arg in "$@"; do
        # Normalize to source file path (not INDEX.md)
        if [[ "$arg" == *.INDEX.md ]]; then
            stale_sources="$stale_sources${arg%.INDEX.md}.md"$'\n'
        elif [[ "$arg" == *.md ]]; then
            stale_sources="$stale_sources$arg"$'\n'
        fi
    done
fi

echo "Stale indexes found (need refresh):"
echo "$stale_sources" | grep . | while read -r src; do
    echo "  - $(basename "$src")"
done
echo ""

# For each stale source, prepare the refresh command
refreshed=0
errors=0

echo "════════════════════════════════════════"
echo "📋 To complete the refresh, run these commands:"
echo ""

while IFS= read -r source_file; do
    [[ -z "$source_file" ]] && continue

    # Verify source file exists
    if [[ ! -f "$source_file" ]]; then
        echo "❌ Source file not found: $source_file"
        ((errors++))
        continue
    fi

    echo "   /doc-index $source_file"
    ((refreshed++))

done <<< "$stale_sources"

echo ""
echo "════════════════════════════════════════"
if [[ $refreshed -gt 0 ]]; then
    echo "✅ Ready to refresh: $refreshed index(es)"
fi
if [[ $errors -gt 0 ]]; then
    echo "❌ Errors: $errors"
fi
echo "════════════════════════════════════════"
