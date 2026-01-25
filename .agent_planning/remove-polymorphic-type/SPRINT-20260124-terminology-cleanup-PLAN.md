# Sprint: terminology-cleanup - Complete Polymorphic→Generic Terminology Migration

Generated: 2026-01-24
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Complete the terminology migration from "polymorphic" to "payload-generic" by renaming files and updating all references.

## Scope

**Deliverables:**
1. Rename pass0-polymorphic-types.ts to pass0-payload-resolution.ts
2. Update all imports and exports
3. Update all comments referencing old terminology

## Work Items

### P0: Rename pass0-polymorphic-types.ts

**Acceptance Criteria:**
- [ ] `src/graph/passes/pass0-polymorphic-types.ts` renamed to `src/graph/passes/pass0-payload-resolution.ts`
- [ ] Function `pass0PolymorphicTypes` renamed to `pass0PayloadResolution`
- [ ] All imports updated across codebase
- [ ] All exports updated in `src/graph/passes/index.ts`
- [ ] TypeScript compiles without errors

**Technical Notes:**
- Single file rename + search-replace for function name
- Update: `src/graph/passes/index.ts` (import, usage, export)
- No logic changes required

### P1: Update documentation comments

**Acceptance Criteria:**
- [ ] `src/graph/passes/index.ts` - header comment updated ("Pass 0: Payload resolution")
- [ ] `src/blocks/signal-blocks.ts:20` - update "pass0-polymorphic-types" reference
- [ ] `src/blocks/field-blocks.ts:19` - update "pass0-polymorphic-types" reference
- [ ] No remaining references to "polymorphic" in graph passes context

**Technical Notes:**
- Grep for "polymorphic" and update contextually
- Keep "polymorphic" only where it refers to general CS concept, not this system

### P2: Verification

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] Grep for "pass0.*[Pp]olymorphic" returns no matches in src/

**Technical Notes:**
- Run full test suite to catch any missed references
- Verify no runtime changes (this is pure refactoring)

## Dependencies

- None (all prior sprints completed)

## Risks

- **Minimal**: This is cosmetic refactoring with no logic changes
- All tests should continue to pass unchanged
