# Runtime Findings: doc-index skill

**Last updated**: 2026-01-12T02:05:01Z
**Scope**: doc-index skill evaluation (post-fixes)
**Confidence**: FRESH

## Compression Behavior

**Finding**: Compression metadata NOW ACCURATE after fix script applied.

**Evidence**:
- `compression: 38.8%` means index is 38.8% of original (61.2% reduction) ✅
- All 17 INDEX files recalculated correctly
- SKILL.md line 55 has clarifying comment: `# Percentage of original RETAINED (not reduced)`

**Previous issue**: Metadata was backwards and inconsistent (FIXED as of 2026-01-12).

**Impact**: Metadata is now trustworthy. Compression targets achieved (52-73% reduction across corpus).

**Tooling**: `scripts/fix-index-compression.sh` recalculates all compression percentages correctly.

## Staleness Detection

**Finding**: Staleness detection tooling NOW EXISTS.

**Tooling**: `scripts/validate-indexes.sh`
- Checks `source_hash` against current source
- Reports FRESH/STALE/ERROR for each INDEX
- Returns non-zero exit code if any stale/errors
- Gracefully handles missing source_hash fields

**Usage**:
```bash
scripts/validate-indexes.sh
# Output:
# ✅ 01-type-system.INDEX.md - FRESH
# ❌ INVARIANTS.INDEX.md - STALE
# Exit code 1 if any stale/errors
```

**Recommendation**: Run this before using indexes for contradiction detection. Add to CI to prevent stale indexes from being committed.

## Line Reference Accuracy

**Finding**: Line references are PRECISE and RELIABLE.

**Evidence**: 9/9 spot-checks across two evaluations matched exactly (100% accuracy).

| Format | Behavior |
|--------|----------|
| `[L52]` | Points to exact line 52 |
| `[L83-99]` | Points to exact range lines 83-99 |

**Recommendation**: Trust line references for targeted source lookups.

## Contradiction Detection Capability

**Finding**: Indexes CAN detect explicit contradictions, but CANNOT detect semantic/contextual ones.

**What works**:
- Conflicts in definitions (e.g., "X is Y" vs "X is Z")
- Missing concepts (references without definitions)
- Explicit assertion conflicts

**What fails**:
- Semantic contradictions requiring context
- Implicit assumptions that conflict
- Design philosophy inconsistencies

**Example detected**: Domain cardinality confusion (DomainN as runtime block vs domain as compile-time resource).

**False negative risk**: Subtle contradictions may be missed without full source read.

**Recommendation**: Use indexes for FIRST PASS contradiction detection, then verify with source reads when conflicts detected.

## Completeness Assessment

**Finding**: Most content preserved with acceptable compression trade-offs.

**Compression strategy**: Keep names, IDs, line references. Drop verbose descriptions.

**Critical content preservation**:
- All invariant IDs and rules preserved
- Key assertions extracted correctly
- Examples included when they define meaning (e.g., I27 includes "no UI order, object identity, incidental eval")

**Acceptable omissions**:
- Rationale text (can be looked up via line ref)
- Detailed consequences (can be looked up)
- Cross-references between sections (navigable via line refs)

**Pattern**: When rules are defined BY examples, the examples are preserved in compressed form.

**Recommendation**: Indexes are sufficient for contradiction detection and navigation. Read source for implementation details.

## Extraction Rules Clarity

**Finding**: Extraction rules NOW COMPREHENSIVE after SKILL.md update.

**Updated rules** (SKILL.md lines 20-39) now include:
- MUST/MUST NOT/SHALL/SHALL NOT (RFC 2119)
- REQUIRED/FORBIDDEN/MANDATORY
- Imperative assertions ("all signals flow through...")
- **Bold requirements** or numbered requirements
- Guidance: "If examples define the rule's meaning, include them"

**Remaining subjectivity**: "If examples define meaning" requires judgment, but it's reasonable.

**Recommendation**: Follow the expanded extraction rules for consistent indexing.

## Haiku Execution Quality

**Finding**: claude-haiku-4-5 successfully generated 16 indexes from 87-line simplified instructions.

**Quality**: Consistent extraction, accurate line refs, reasonable compression.

**Failure modes**: Not tested (all 16 succeeded).

**Recommendation**: Trust Haiku for batch indexing with the updated SKILL.md instructions.

## Production Readiness

**Status**: READY for integration into canonicalize-architecture.

**Blockers resolved**:
1. ✅ Compression metadata accurate
2. ✅ Staleness detection tooling exists
3. ✅ Completeness acceptable
4. ✅ Extraction rules clarified

**Remaining work** (not blockers):
- Regenerate 3 stale indexes (INVARIANTS, diagnostics-system, block-system)
- Add staleness check to CI (nice-to-have)

**Recommendation**: Use doc-index skill for batch indexing. Run `scripts/validate-indexes.sh` before using indexes for contradiction detection. Trust the metadata.
