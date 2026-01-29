---
command: /canonicalize-architecture design-docs/canonical-types/
files: 00-exhaustive-type-system.md 01-CanonicalTypes.md 02-How-To-Get-There.md 03-Types-Analysis.md 04-CanonicalTypes-Analysis.md 05-LitmusTest.md 06-DefinitionOfDone-90%.md 07-DefinitionOfDone-100%.md 09-NamingConvention.md 10-RulesForNewTypes.md 11-Perspective.md 12-Branch.md 14-Binding-And-Continuity.md 15-FiveAxesTypeSystem-Conclusion.md
indexed: true
source_files:
  - design-docs/canonical-types/00-exhaustive-type-system.md
  - design-docs/canonical-types/01-CanonicalTypes.md
  - design-docs/canonical-types/02-How-To-Get-There.md
  - design-docs/canonical-types/03-Types-Analysis.md
  - design-docs/canonical-types/04-CanonicalTypes-Analysis.md
  - design-docs/canonical-types/05-LitmusTest.md
  - design-docs/canonical-types/06-DefinitionOfDone-90%.md
  - design-docs/canonical-types/07-DefinitionOfDone-100%.md
  - design-docs/canonical-types/09-NamingConvention.md
  - design-docs/canonical-types/10-RulesForNewTypes.md
  - design-docs/canonical-types/11-Perspective.md
  - design-docs/canonical-types/12-Branch.md
  - design-docs/canonical-types/14-Binding-And-Continuity.md
  - design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md
---

# Open Questions & Ambiguities: CanonicalType System

Generated: 2026-01-29T07:57:23Z
Supersedes: None (first run)

## How to Resolve Items

This file is designed for iterative resolution. To resolve an item:

1. **Edit this file directly** - Change `Status: UNRESOLVED` to `Status: RESOLVED`
2. **Add your resolution** - Use one of these approaches:
   - `Resolution: AGREE` - Accept the suggested resolution as-is
   - `Resolution: AGREE, but [adjustment]` - Accept with minor modification
   - `Resolution: [your decision]` - Provide your own resolution
3. **Re-run the command** - The next run will carry forward your resolution

**Shorthand**: Writing just `AGREE` means you accept the **Suggested Resolution** exactly as written.

When ALL items are resolved, the next run will generate the canonical specification encyclopedia.

---

## Quick Wins

All documents are internally consistent. No quick-win contradictions found.

---

## Resolution Status: COMPLETE ✓

**No contradictions, inconsistencies, or consequential ambiguities were found.**

The 14 source documents form a coherent, self-consistent specification for the CanonicalType system. Key evidence:

1. **Single Authority Principle**: Consistently stated across all documents (00, 01, 05, 10, 15)
2. **5-Axis Model**: Consistently defined (cardinality, temporality, binding, perspective, branch)
3. **Invariants**: 5 hard invariants (I1-I5) consistently referenced
4. **Migration Path**: Phases 0-5 are consistently described with clear dependencies
5. **Naming Convention**: Single clear rule (ValueExpr<Op>) consistently applied
6. **Definition of Done**: 90% and 100% checklists are complementary, not contradictory

---

## Minor Notes (Informational Only)

These are not contradictions—just observations for awareness:

### N1: Empty Binding Document

- **Location**: 14-Binding-And-Continuity.md
- **Observation**: File is empty (1 byte)
- **Impact**: None—binding semantics are adequately covered in 15-FiveAxesTypeSystem-Conclusion.md and implied by the Extent structure in 00-exhaustive-type-system.md
- **Suggested Action**: Either populate with detailed binding semantics or delete the placeholder
- **Status**: INFORMATIONAL (not blocking)

### N2: Perspective/Branch Default Canonicalization

- **Observation**: Documents specify `default` canonicalizes to specific values (world/main) but the reference implementation in 00-exhaustive-type-system.md uses `{ kind: 'default' }` directly without explicit canonicalization
- **Impact**: None if canonicalization happens at validation time as specified
- **Suggested Action**: Ensure axis-validate.ts canonicalizes defaults before comparison
- **Status**: INFORMATIONAL (implementation detail)

---

## Cross-Reference Matrix

All documents are consistent on core concepts:

| Concept | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 09 | 10 | 11 | 12 | 15 |
|---------|----|----|----|----|----|----|----|----|----|----|----|----|----| 
| CanonicalType is only authority | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| 5-axis extent | ✓ | ✓ | - | - | - | - | - | - | - | ✓ | ✓ | ✓ | ✓ |
| Signal/field/event derived | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | - | - | ✓ |
| Single enforcement gate | ✓ | - | - | - | - | ✓ | - | ✓ | - | - | ✓ | ✓ | ✓ |
| No duplicate authority | ✓ | - | - | ✓ | ✓ | ✓ | - | - | - | ✓ | - | - | ✓ |

Legend: ✓ = explicitly affirmed, - = not addressed (no conflict)

---

## Resolution Progress

| Category | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Critical Contradictions | 0 | 0 | 0 |
| High-Impact Ambiguities | 0 | 0 | 0 |
| Terminology | 0 | 0 | 0 |
| Gaps | 0 | 0 | 0 |
| Low-Impact | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** |

**Progress: 100%** ✓

The next run can proceed directly to FINAL encyclopedia generation.
