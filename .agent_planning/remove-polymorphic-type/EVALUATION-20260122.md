# Evaluation: Remove ??? Polymorphic Type

Generated: 2026-01-22T11:25:00Z
Verdict: **CONTINUE**

## Current State

The codebase uses `'???'` as a PayloadType literal to indicate polymorphic/inferred types. This was the v1 approach before the PayloadGeneric block system was implemented.

### Where ??? is Used

1. **PayloadType definition** (`canonical-types.ts:59`):
   - `'???'` is a valid PayloadType literal

2. **Blocks using ??? for polymorphism**:
   - `Const` (signal-blocks.ts) - polymorphic constant
   - `Broadcast` (field-blocks.ts) - polymorphic signal→field
   - `Expression` (expression-blocks.ts) - polymorphic expression with A-E inputs
   - `ArraySource` (array-blocks.ts) - polymorphic array source
   - `ForEach`, `ForEachWithIndex` (instance-blocks.ts) - polymorphic iteration

3. **Type resolution pass** (`pass0-polymorphic-types.ts`):
   - Resolves `???` by propagating types from connected ports
   - Stores resolved type in `block.params.payloadType`

4. **Type compatibility checks** (multiple locations):
   - `pass2-types.ts`, `adapters.ts`, `typeValidation.ts`
   - `???` is treated as "compatible with anything"

5. **Runtime guards**:
   - `bridges.ts:223`, `BufferPool.ts:43`, `signal-blocks.ts:139`
   - Throw errors if `???` reaches runtime unresolved

6. **UI**:
   - `typeValidation.ts:29` - gray color for polymorphic ports

## What Needs to Change

### Phase 1: Const Block Migration (User's Request)
1. Add payload metadata to Const block using new PayloadGeneric system
2. Change Const to use explicit `allowedPayloads` instead of `???`
3. Remove `???` from Const block's output type
4. Update type resolution to use payload metadata

### Phase 2: Full ??? Removal (Future)
- Migrate all other ??? blocks (Expression, Broadcast, etc.)
- Remove `???` from PayloadType union
- Remove pass0-polymorphic-types.ts
- Update all compatibility checks

## Risks

- **Breaking change**: Const block behavior change could break existing patches
- **Type inference loss**: Need to ensure payload metadata supports same inference patterns

## Recommendation

Focus on Phase 1 (Const block) only. This is a surgical migration that:
1. Adds payload metadata to Const
2. Uses the new system for type validation
3. Keeps `???` in the codebase for other blocks (deferred work)

## Confidence: HIGH

The Const block migration is well-defined:
- We have the PayloadGeneric system ready
- Const supports: float, int, bool, phase, unit (per docs)
- Implementation is straightforward metadata addition
