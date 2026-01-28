# Sprint: Field Kernel Type Parameters

**Generated:** 2026-01-25T13:22:00Z
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Estimated effort:** 20 minutes

## Sprint Goal

Replace ~30 'as any' casts for field kernel type parameters with proper factory function usage.

## Scope

**Deliverables:**
- Remove all `type as any` casts passed to `applyFieldKernel()` and `applyFieldKernelZipSig()`
- Use `canonicalType()` and `signalTypeField()` factory functions
- Ensure proper type imports from canonical-types module

**Files affected:**
- `src/__tests__/field-kernel-contracts.test.ts`

## Work Items

### P0: Replace field kernel type parameter casts
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] All `type as any` casts in applyFieldKernel calls replaced with `canonicalType(...)` or `signalTypeField(...)`
- [ ] Determine which factory function applies to each test case
- [ ] Import statements updated to include required factories
- [ ] Tests pass without regression
- [ ] All 30+ casts eliminated

**Technical Notes:**
- `canonicalType()` factory function exists in `/src/core/canonical-types.ts`
- `signalTypeField()` factory may also be available for field-specific types
- Each cast location should be examined to determine appropriate factory
- No logic changes required, only type creation

## Dependencies

- Category 1 (branded types) - can run in parallel

## Risks

- **Low:** Factory functions are tested in production code
- **Mitigation:** Verify each factory returns correct `CanonicalType` structure before/after conversion

## Implementation Sequence

1. Read field-kernel-contracts.test.ts to identify all type parameter casts
2. For each cast, determine appropriate factory function
3. Replace casts with factory calls
4. Add necessary imports
5. Run field kernel contract tests to verify
