# Sprint: slot-declarations - API Alignment with Spec Naming

Generated: 2026-01-28-054900  
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0  
Status: READY FOR IMPLEMENTATION  
Source: EVALUATION-2026-01-28-055013.md

## Sprint Goal
Align ScheduleIR API with specification naming conventions by adding type aliases and convenience accessors for slot declarations without breaking existing functionality.

## Scope

**Deliverables:**
- Type aliases `ScalarSlotDecl` and `FieldSlotDecl` matching spec terminology
- Convenience accessor functions `getScalarSlots()` and `getFieldSlots()`
- Documentation updates clarifying naming conventions
- Optional deprecation notices for legacy `stateSlots` array

**Non-Goals:**
- Changing internal implementation (stateMappings remains canonical)
- Modifying runtime behavior or hot-swap logic
- Breaking existing code using `stateMappings`

## Work Items

### P0 (Critical) - Type Alias Definitions **[HIGH]**

**Dependencies**: None  
**Spec Reference**: [04-compilation.md §I9] • **Status Reference**: [EVALUATION-2026-01-28-055013.md §Proposed Solution]

#### Description
Add type aliases in `src/compiler/ir/types.ts` that map spec-aligned names to existing implementation types. This creates a bridge between specification terminology (`ScalarSlotDecl`, `FieldSlotDecl`) and implementation types (`StateMappingScalar`, `StateMappingField`).

#### Acceptance Criteria
- [ ] `export type ScalarSlotDecl = StateMappingScalar;` added after line 638 in types.ts
- [ ] `export type FieldSlotDecl = StateMappingField;` added after ScalarSlotDecl definition
- [ ] JSDoc comments on both aliases reference the specification section (I9)
- [ ] TypeScript compilation succeeds with no type errors
- [ ] Both aliases are exported from `src/compiler/ir/types.ts`

#### Technical Notes
- Place aliases immediately after the `StateMappingScalar` and `StateMappingField` interface definitions
- Use JSDoc to clarify: "Spec-aligned name for StateMappingScalar. See 04-compilation.md §I9"
- These are purely type-level aliases; no runtime overhead

---

### P0 (Critical) - Convenience Accessor Functions **[HIGH]**

**Dependencies**: Type alias definitions  
**Spec Reference**: [04-compilation.md §I9] • **Status Reference**: [EVALUATION-2026-01-28-055013.md §Proposed Solution]

#### Description
Add helper functions to filter `stateMappings` array into typed scalar and field slot arrays. These provide the spec's expected API (`scalarSlots`, `fieldSlots`) while maintaining the single-source-of-truth implementation.

#### Acceptance Criteria
- [ ] `getScalarSlots(schedule: ScheduleIR): ScalarSlotDecl[]` function added to schedule-program.ts
- [ ] `getFieldSlots(schedule: ScheduleIR): FieldSlotDecl[]` function added to schedule-program.ts
- [ ] Both functions use TypeScript type guards (`m is ScalarSlotDecl`) for correct return types
- [ ] Functions filter by `kind` discriminator ('scalar' vs 'field')
- [ ] Unit test validates correct filtering and type narrowing

#### Technical Notes
Implementation pattern:
```typescript
export function getScalarSlots(schedule: ScheduleIR): ScalarSlotDecl[] {
  return schedule.stateMappings.filter((m): m is ScalarSlotDecl => m.kind === 'scalar');
}

export function getFieldSlots(schedule: ScheduleIR): FieldSlotDecl[] {
  return schedule.stateMappings.filter((m): m is FieldSlotDecl => m.kind === 'field');
}
```

Add these after the ScheduleIR interface definition, in the "Helper Functions" section (after line 77).

---

### P1 (High) - Documentation Updates **[HIGH]**

**Dependencies**: Type aliases, accessor functions  
**Spec Reference**: [04-compilation.md §I9] • **Status Reference**: [EVALUATION-2026-01-28-055013.md §Documentation Clarity]

#### Description
Update JSDoc comments and inline documentation to clarify the relationship between spec terminology and implementation choices, explaining why `stateMappings` is the canonical source and how the convenience functions provide spec-aligned views.

#### Acceptance Criteria
- [ ] ScheduleIR interface comment (line 32-42) updated to mention type aliases and accessor functions
- [ ] `stateMappings` field comment explicitly states "Canonical source for ScalarSlotDecl and FieldSlotDecl"
- [ ] `stateSlots` field comment strengthened with "**Legacy format** - prefer stateMappings for all new code"
- [ ] Code example added in schedule-program.ts showing recommended usage patterns
- [ ] All JSDoc comments use correct TypeScript syntax and render properly in IDE tooltips

#### Technical Notes
Recommended JSDoc additions:
- Link to spec section: `@see design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md §I9`
- Usage example showing `getScalarSlots()` / `getFieldSlots()` pattern
- Clarify that `stateMappings` union array is implementation choice, not spec deviation

---

### P2 (Medium) - Deprecation Notices **[HIGH]**

**Dependencies**: Documentation updates  
**Spec Reference**: N/A (implementation hygiene) • **Status Reference**: [EVALUATION-2026-01-28-055013.md §Recommended Actions]

#### Description
Add `@deprecated` JSDoc tags to the legacy `stateSlots` field to guide developers toward the modern `stateMappings` API, reducing confusion and preventing new code from using the legacy format.

#### Acceptance Criteria
- [ ] `@deprecated` tag added to `stateSlots` field in ScheduleIR interface (line 56-57)
- [ ] Deprecation message includes: "Legacy expanded format. Use stateMappings for hot-swap migration."
- [ ] Deprecation message suggests alternative: "Use getScalarSlots() / getFieldSlots() for typed access"
- [ ] Existing code using `stateSlots` continues to compile (no breaking changes)
- [ ] IDE shows deprecation warnings when hovering over `stateSlots` field

#### Technical Notes
Deprecation syntax:
```typescript
/**
 * @deprecated Legacy expanded format. Use stateMappings for hot-swap migration.
 * Use getScalarSlots() / getFieldSlots() for spec-aligned typed access.
 */
readonly stateSlots: readonly StateSlotDef[];
```

This is non-breaking; existing code continues to work with warnings only.

---

## Dependencies

```
[Type Aliases] → [Accessor Functions] → [Documentation] → [Deprecation]
```

All work items are sequential but can be completed in a single focused session.

---

## Risks

**Risk 1: Breaking Changes**  
- **Likelihood**: Very Low  
- **Impact**: High  
- **Mitigation**: All changes are additive (type aliases, new functions, JSDoc). No existing APIs modified. Verify with `npm test` after each step.

**Risk 2: Type Inference Issues**  
- **Likelihood**: Low  
- **Impact**: Medium  
- **Mitigation**: Use explicit type guards (`m is ScalarSlotDecl`) in filter functions to ensure correct TypeScript narrowing.

**Risk 3: Naming Confusion**  
- **Likelihood**: Medium (if docs unclear)  
- **Impact**: Low  
- **Mitigation**: Comprehensive JSDoc clarifying relationship between spec names and implementation. Add usage examples.

---

## Success Metrics

- ✅ All 347 existing tests pass (no regressions)
- ✅ TypeScript compilation succeeds with no new errors
- ✅ `getScalarSlots()` and `getFieldSlots()` return correctly typed arrays
- ✅ IDE autocomplete shows both old (`stateMappings`) and new (`ScalarSlotDecl`) names
- ✅ Deprecation warnings appear for `stateSlots` usage

---

## Notes

**Why Aliases Instead of Renaming?**  
The implementation's `StateMappingScalar`/`StateMappingField` names are actually **more descriptive** than the spec's `ScalarSlotDecl`/`FieldSlotDecl`. They clarify that these are "mappings" between semantic state IDs and positional slots. The aliases provide spec compatibility while preserving the better internal naming.

**Why Union Array Instead of Separate Arrays?**  
The single `stateMappings: StateMapping[]` union array with a discriminator (`kind: 'scalar' | 'field'`) is a superior design:
- Single source of truth (no sync issues)
- Type-safe discrimination via TypeScript unions
- Natural iteration pattern (process all state mappings in order)
- Easy filtering when needed (via provided helpers)

The spec's separate `scalarSlots[]` and `fieldSlots[]` would duplicate storage and risk inconsistency.

**Estimated Effort**: 1-2 hours (including testing)
