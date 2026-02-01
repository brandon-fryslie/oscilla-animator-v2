# Core Type System - Trivial Gaps

These are minor naming differences or missing convenience functions that don't affect correctness.

## 1. canonicalEvent() vs canonicalEventOne()

**Spec requirement**: `canonicalEventOne()` and `canonicalEventField(instance)`

**Current state**:
- src/core/canonical-types.ts:748 - `canonicalEvent()` exists
- `canonicalEventOne()` does not exist
- `canonicalEventField(instance)` does not exist

**Classification rationale**: The implementation has `canonicalEvent()` which creates a one-cardinality event (correct semantics). The spec prefers explicit naming `canonicalEventOne()` and `canonicalEventField()` for symmetry with signal/field. This is a naming preference, not a correctness issue.

**Impact**: Very low. Search shows no usage of the spec-preferred names in actual code.

**Recommendation**: Rename `canonicalEvent()` to `canonicalEventOne()` and add `canonicalEventField()` for spec compliance and symmetry. Keep `canonicalEvent()` as a deprecated alias temporarily.

---

## 2. deriveKind() marked deprecated but used in comments

**Spec requirement**: `deriveKind(t)` is the single function deriving signal/field/event from extent

**Current state**:
- src/core/canonical-types.ts:775-780 - `DerivedKind` type exists with deprecation comment
- src/compiler/__tests__/no-legacy-types.test.ts:121-156 - Test enforces deriveKind is NOT used in production code
- src/compiler/backend/lower-blocks.ts:480,626 - Comments say "check extent directly instead of using deriveKind"
- src/compiler/frontend/axis-validate.ts:103 - Comment says "no deriveKind dependency"

**Classification rationale**: The spec requires deriveKind to exist as the canonical classification function. The implementation has deleted it and replaced all usage with direct extent checks. This is a TO-REVIEW item (possibly better implementation), but for spec compliance it's TRIVIAL - the function can be re-added trivially, and the current approach (direct extent checks) is more correct.

**Impact**: None. The replacement pattern is better.

**Recommendation**: Update spec to reflect that deriveKind is deprecated/removed in favor of direct extent checks, OR re-add deriveKind as a utility function but mark it as convenience-only (not required).

---

## Summary

All items in this category are naming/documentation issues, not correctness issues. The implementation is sound; it just uses different names or patterns than the spec prefers.
