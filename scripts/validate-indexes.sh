#!/usr/bin/env bash
# Validate that INDEX.md files are up-to-date with their source documents
# Returns non-zero exit code if any indexes are stale

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Validating index freshness..."
echo ""

# Find all INDEX.md files
index_files=$(find design-docs/CANONICAL-oscilla-v2.5-20260109 -name "*.INDEX.md" -type f)

stale_count=0
fresh_count=0
error_count=0

for index_file in $index_files; do
    # Derive source file path from index file
    source_file="${index_file%.INDEX.md}.md"

    if [[ ! -f "$source_file" ]]; then
        echo "❌ ERROR: Source file not found for $index_file"
        ((error_count++))
        continue
    fi

    # Extract stored hash from index frontmatter
    stored_hash=$(grep "^source_hash:" "$index_file" | head -1 | awk '{print $2}' || echo "")

    if [[ -z "$stored_hash" ]]; then
        echo "⚠️  WARNING: No source_hash in $index_file"
        ((error_count++))
        continue
    fi

    # Calculate current hash of source file
    current_hash=$(shasum -a 256 "$source_file" | cut -c1-12)

    # Compare hashes
    if [[ "$stored_hash" == "$current_hash" ]]; then
        echo "✅ $(basename "$index_file") - FRESH"
        ((fresh_count++))
    else
        echo "❌ $(basename "$index_file") - STALE"
        echo "   Stored:  $stored_hash"
        echo "   Current: $current_hash"
        echo "   Source:  $source_file"
        echo ""
        ((stale_count++))
    fi
done

echo ""
echo "════════════════════════════════════════"
echo "Fresh:  $fresh_count indexes"
echo "Stale:  $stale_count indexes"
if [[ $error_count -gt 0 ]]; then
    echo "Errors: $error_count indexes"
fi
echo "════════════════════════════════════════"

# Exit with error if any stale or error indexes found
if [[ $stale_count -gt 0 || $error_count -gt 0 ]]; then
    echo ""
    echo "⚠️  Some indexes need regeneration"
    exit 1
fi

echo ""
echo "✅ All indexes are fresh"
exit 0
