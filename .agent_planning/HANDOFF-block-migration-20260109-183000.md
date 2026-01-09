# Handoff: Migrate All Blocks to New Canonical Type System

**Created**: 2026-01-09T18:30:00Z
**For**: Implementation agent for P3 of canonical architecture alignment
**Status**: ready-to-start

---

## Objective

Migrate all block definitions in `src/compiler/blocks/` from the old `TypeDesc` type system to the new 5-axis canonical type system defined in `src/core/canonical-types.ts`.

## Current State

### What's Been Done
- ✅ P0: Canonical type system implemented (`src/core/canonical-types.ts`)
- ✅ P1: 52 tests for canonical types pass (`src/core/__tests__/canonical-types.test.ts`)
- ✅ P2: All existing type errors fixed, `npm run typecheck` passes
- ✅ All 68 tests pass including steel-thread animated particles
- ✅ Registry helper functions use `createTypeDesc()` for backward compatibility

### What's In Progress
- 🔄 P3: Block migration to new type system (THIS TASK)

### What Remains
- Decide on migration strategy: gradual (adapters) or big-bang
- Update block definitions to use `SignalType` instead of `TypeDesc`
- Update `ValueRef` types in registry to use canonical types
- Add tests for migrated blocks

## Context & Background

### Why We're Doing This
The new 5-axis canonical type system (PayloadType × Extent) replaces the flat `TypeDesc` structure. This separates "what the value is" (payload) from "where/when it exists" (cardinality, temporality, binding, perspective, branch). This enables generic blocks, proper constraint solving, and cleaner IR generation.

### Key Decisions Made
| Decision | Rationale | Date |
|----------|-----------|------|
| Create parallel type system | Non-disruptive migration | 2026-01-09 |
| Keep `TypeDesc` for runtime (for now) | Preserve working runtime | 2026-01-09 |
| Exclude `passes-v2` from build | WIP code, not used | 2026-01-09 |
| Use `ValueSlot` (number) not `SlotId` (string) | Runtime uses numeric arrays | 2026-01-09 |

### Important Constraints
- All 68 existing tests must continue to pass
- `npm run typecheck` must remain clean
- Steel-thread animated particles demo must work
- No changes to runtime evaluation (yet)
- Backward compatibility through adapters if needed

## Acceptance Criteria

- [ ] All blocks use `SignalType`
- [ ] Block registry supports canonical types
- [ ] All existing tests pass
- [ ] Typecheck remains clean
- [ ] At least one block (e.g., `Add`) demonstrates full canonical type usage

## Scope

### Files to Modify

**Core Registry** (modify first):
- `src/compiler/blocks/registry.ts` - Add canonical type support

**Time Blocks**:
- `src/compiler/blocks/time/InfiniteTimeRoot.ts`
- `src/compiler/blocks/time/FiniteTimeRoot.ts`

**Domain Blocks**:
- `src/compiler/blocks/domain/DomainN.ts`
- `src/compiler/blocks/domain/GridDomain.ts`
- `src/compiler/blocks/domain/FieldBroadcast.ts`
- `src/compiler/blocks/domain/FieldMap.ts`
- `src/compiler/blocks/domain/FieldZipSig.ts`

**Signal Blocks**:
- `src/compiler/blocks/signal/ConstFloat.ts`
- `src/compiler/blocks/signal/AddSignal.ts`
- `src/compiler/blocks/signal/MulSignal.ts`
- `src/compiler/blocks/signal/Oscillator.ts`
- `src/compiler/blocks/signal/MousePosition.ts`

**Render Blocks** (most complex):
- `src/compiler/blocks/render/FieldFromDomainId.ts`
- `src/compiler/blocks/render/RenderInstances2D.ts`
- `src/compiler/blocks/render/FieldGoldenAngle.ts`
- `src/compiler/blocks/render/FieldAngularOffset.ts`
- `src/compiler/blocks/render/FieldRadiusSqrt.ts`
- `src/compiler/blocks/render/FieldPolarToCartesian.ts`
- `src/compiler/blocks/render/FieldAdd.ts`
- `src/compiler/blocks/render/FieldHueFromPhase.ts`
- `src/compiler/blocks/render/HueRainbow.ts`
- `src/compiler/blocks/render/FieldPulse.ts`
- `src/compiler/blocks/render/FieldJitter2D.ts`
- `src/compiler/blocks/render/FieldAttract2D.ts`

### Related Components
- `src/core/canonical-types.ts` - New type system (SOURCE OF TRUTH)
- `src/core/types.ts` - Old type system (keep for runtime - runtime must be updated next!)
- `src/compiler/ir/types.ts` - IR types (migrate to new type system)

### Stretch Goals
- Runtime evaluation changes
- IR generation changes
- Renderer changes
- passes-v2 (already excluded from build)

## Implementation Approach

### Recommended Strategy: Adapter Pattern

**Phase 1: Add Adapter Layer to Registry**
1. Add `toTypeDesc(signalType: SignalType): TypeDesc` function
2. Add `fromTypeDesc(typeDesc: TypeDesc): SignalType` function
3. Keep both type systems working simultaneously

**Phase 2: Migrate One Block as Reference**
1. Pick `AddSignal` as simplest example
2. Update to use canonical types internally
3. Use adapters at boundaries (PortDef, ValueRef)
4. Ensure tests pass

**Phase 3: Migrate Remaining Blocks**
1. Signal blocks (simpler - no domain concerns)
2. Time blocks
3. Domain blocks
4. Render blocks (last - most complex)

### Patterns to Follow

**Signal port type** (one + continuous):
```typescript
import { signalTypeSignal } from '../../core/canonical-types';

const floatSignal = signalTypeSignal('float');
// Adapts to: { world: 'signal', domain: 'float', ... }
```

**Field port type** (many + continuous):
```typescript
import { signalTypeField } from '../../core/canonical-types';

const floatField = signalTypeField('float', 'domainId');
// Adapts to: { world: 'field', domain: 'float', ... }
```

**Event port type** (one + discrete):
```typescript
import { signalTypeTrigger } from '../../core/canonical-types';

const trigger = signalTypeTrigger('unit');
// Adapts to: { world: 'event', domain: 'float', ... }
```

### Known Gotchas
- `TypeDesc` uses `domain: Domain` (string union from core/types)
- `SignalType` uses `payload: PayloadType` (smaller set)
- Need to map 'phase' domain to 'phase' payload (exists in canonical)
- Need to map 'time' domain to 'float' payload (time is metadata not payload)
- Domain blocks output `domain` ValueRef which has no payload (special case)

## Reference Materials

### Planning Documents
- [PLAN-20260109-180000.md](.agent_planning/canonical-arch-alignment/PLAN-20260109-180000.md) - Sprint plan
- [DOD-20260109-180000.md](.agent_planning/canonical-arch-alignment/DOD-20260109-180000.md) - Acceptance criteria
- [CONTEXT-20260109-180000.md](.agent_planning/canonical-arch-alignment/CONTEXT-20260109-180000.md) - Implementation context

### Spec Documents
- `design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md` - Authoritative spec

### Codebase References
- `src/core/canonical-types.ts` - New type system with helpers
- `src/core/__tests__/canonical-types.test.ts` - Test examples
- `src/compiler/blocks/registry.ts` - Current registry with helper functions

## Questions & Blockers

### Open Questions
- [ ] Should adapters be permanent or temporary during migration?
- [ ] Should IR types (`SigExpr`, etc.) eventually use `SignalType`?
- [ ] How to handle `domain` output ports (not a PayloadType)?

### Current Blockers
- None - ready to proceed

### Need User Input On
- Preferred migration strategy (adapter vs big-bang)
- Priority order for blocks if partial migration acceptable

## Testing Strategy

### Existing Tests
- `src/compiler/__tests__/compile.test.ts` - Basic compilation
- `src/compiler/__tests__/steel-thread.test.ts` - Full pipeline
- `src/runtime/__tests__/integration.test.ts` - Runtime execution
- Coverage: All 68 tests pass

### New Tests Needed
- [ ] Test adapter functions (toTypeDesc, fromTypeDesc)
- [ ] Test round-trip: SignalType → TypeDesc → SignalType

### Manual Testing
- [ ] Run `npm run typecheck` after each block migration
- [ ] Run `npm run test` after each block migration
- [ ] Verify steel-thread test continues to work

## Success Metrics

- All 68 existing tests pass
- `npm run typecheck` exits 0
- At least one block fully uses canonical types
- No runtime behavior changes

---

## Next Steps for Agent

**Immediate actions**:
1. Read `src/core/canonical-types.ts` to understand available helpers
2. Read `src/compiler/blocks/registry.ts` to understand current pattern
3. Add adapter functions to registry.ts

**Before starting implementation**:
- [ ] Run `npm run test` to confirm baseline
- [ ] Run `npm run typecheck` to confirm baseline
- [ ] Read canonical architecture spec Section 3.1

**When complete**:
- [ ] Update this handoff with completion status
- [ ] Document any decisions made during migration
- [ ] Update DOD with checked items
