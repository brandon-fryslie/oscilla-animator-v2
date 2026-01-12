#!/usr/bin/env bash
# Fix compression metadata in all INDEX.md files
# The compression field should represent "percentage of original retained" not "percentage reduced"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Fixing compression metadata in all INDEX.md files..."
echo ""

# Find all INDEX.md files
index_files=$(find design-docs/CANONICAL-oscilla-v2.5-20260109 -name "*.INDEX.md" -type f)

fixed_count=0
error_count=0

for index_file in $index_files; do
    # Derive source file path from index file
    source_file="${index_file%.INDEX.md}.md"

    if [[ ! -f "$source_file" ]]; then
        echo "⚠️  WARNING: Source file not found for $index_file"
        ((error_count++))
        continue
    fi

    # Count words in source and index
    source_words=$(wc -w < "$source_file" | tr -d ' ')
    index_words=$(wc -w < "$index_file" | tr -d ' ')

    # Calculate correct compression percentage (retention)
    # compression = (index_words / source_words) * 100
    actual_compression=$(awk "BEGIN {printf \"%.1f\", ($index_words / $source_words) * 100}")

    # Calculate token estimates
    original_tokens=$(awk "BEGIN {printf \"%.0f\", $source_words * 1.3}")
    index_tokens=$(awk "BEGIN {printf \"%.0f\", $index_words * 1.3}")

    # Read current compression value from frontmatter (if exists)
    current_compression=$(grep "^compression:" "$index_file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d '%' || echo "N/A")

    # Update the index file frontmatter
    # Use a temp file to avoid sed in-place issues
    temp_file="${index_file}.tmp"

    awk -v orig_tokens="$original_tokens" \
        -v idx_tokens="$index_tokens" \
        -v compression="$actual_compression" '
    BEGIN { in_frontmatter=0 }
    /^---$/ {
        if (NR==1) { in_frontmatter=1; print; next }
        else { in_frontmatter=0; print; next }
    }
    in_frontmatter && /^original_tokens:/ {
        print "original_tokens: ~" orig_tokens
        next
    }
    in_frontmatter && /^index_tokens:/ {
        print "index_tokens: ~" idx_tokens
        next
    }
    in_frontmatter && /^compression:/ {
        print "compression: " compression "%"
        next
    }
    { print }
    ' "$index_file" > "$temp_file"

    mv "$temp_file" "$index_file"

    # Calculate reduction percentage for display
    reduction=$(awk "BEGIN {printf \"%.1f\", 100 - $actual_compression}")

    echo "✅ $(basename "$index_file")"
    echo "   Source: $source_words words → Index: $index_words words"
    echo "   OLD compression: ${current_compression}% | NEW compression: ${actual_compression}% (${reduction}% reduction)"
    echo ""

    ((fixed_count++))
done

echo "════════════════════════════════════════"
echo "Fixed: $fixed_count files"
if [[ $error_count -gt 0 ]]; then
    echo "Errors: $error_count files"
fi
echo "════════════════════════════════════════"
