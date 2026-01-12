#!/usr/bin/env bash
# Detect stale indexes and regenerate them using doc-index skill
# This script integrates with the doc-index skill to keep indexes synchronized

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "🔄 Detecting stale indexes..."
echo ""

# Get list of stale indexes from validation script
validation_output=$("$REPO_ROOT/scripts/validate-indexes.sh" 2>&1 || true)

# Parse validation output to find stale files
stale_indexes=$(echo "$validation_output" | grep "^❌" | awk '{print $2}' || true)

if [[ -z "$stale_indexes" ]]; then
    echo "✅ All indexes are fresh"
    exit 0
fi

echo "Found stale indexes:"
echo "$stale_indexes" | while read -r index_file; do
    echo "  - $index_file"
done
echo ""

refreshed_count=0
error_count=0

# Regenerate each stale index
while IFS= read -r index_file; do
    if [[ -z "$index_file" ]]; then
        continue
    fi

    # Derive source file path from index file
    source_file="${index_file%.INDEX.md}.md"

    if [[ ! -f "design-docs/CANONICAL-oscilla-v2.5-20260109/$source_file" ]]; then
        source_file="design-docs/CANONICAL-oscilla-v2.5-20260109/$source_file"
    fi

    if [[ ! -f "$source_file" ]]; then
        echo "❌ Source file not found: $source_file"
        ((error_count++))
        continue
    fi

    full_index_path="design-docs/CANONICAL-oscilla-v2.5-20260109/$index_file"

    echo "🔄 Regenerating $index_file..."

    # Call doc-index skill to regenerate this specific index
    # Since we're in a bash script, we'll use the Task tool mechanism
    # For now, output instruction for user to run doc-index

    echo "   Run: /doc-index $source_file"
    echo ""

done <<< "$stale_indexes"

echo "════════════════════════════════════════"
echo "To refresh stale indexes, run /doc-index for each source file:"
while IFS= read -r index_file; do
    source_file="${index_file%.INDEX.md}.md"
    echo "  /doc-index design-docs/CANONICAL-oscilla-v2.5-20260109/$source_file"
done <<< "$stale_indexes"
echo "════════════════════════════════════════"
