# Evaluation: Payload Type Resolution Architecture

**Date**: 2026-01-25
**Topic**: Const block missing payloadType - Pass ordering violation
**Verdict**: RESOLVED

## Resolution

**Fix implemented**: Moved payload resolution from graph normalizer to compiler.

- **Deleted**: `src/graph/passes/pass0-payload-resolution.ts`
- **Created**: `src/compiler/passes-v2/pass0-payload-resolution.ts`
- **Updated**: `src/compiler/compile.ts` to call pass0 after normalization
- **Updated**: `src/graph/passes/index.ts` to remove pass0 reference

This ensures payload resolution runs AFTER all normalization passes complete (including default source materialization), so all derived blocks exist when types are resolved.

## Executive Summary

The error "Const block missing payloadType. Type must be resolved by normalizer before lowering" reveals a fundamental architectural flaw in the normalization pipeline ordering. Graph normalizer Pass 0 (payload resolution) runs BEFORE graph normalizer Pass 1 (default source materialization), but Pass 1 creates payload-generic blocks (Const, Broadcast) that need Pass 0's resolution.

**Key distinction**: There are TWO separate pipelines with their own pass numbering:
1. **Graph Normalizer** (`src/graph/passes/`): Pass 0-3 → produces `NormalizedPatch`
2. **Compiler** (`src/compiler/passes-v2/`): Pass 1-7 → produces `CompiledProgramIR`

The compiler's Pass 1 (type constraints) handles **unit inference** (scalar vs phase01 vs radians), NOT payload type inference. Payload type (float vs int vs color) MUST be resolved by graph normalizer Pass 0 BEFORE the entire compiler runs.

This is not a simple bug fix - it requires rethinking how type information flows through the normalization pipeline.

## Root Cause Analysis

### The Timeline of Failure

```
┌──────────────────────────────────────────────────────────────────────────┐
│  User Patch: HsvToRgb block with sat/val having defaultSource            │
│  - sat: unconnected, defaultSource: defaultSourceConst(1.0)              │
│  - val: unconnected, defaultSource: defaultSourceConst(1.0)              │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ↓
═══════════════════════════════════════════════════════════════════════════
                    GRAPH NORMALIZER (src/graph/passes/)
═══════════════════════════════════════════════════════════════════════════
                                 ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  NORMALIZER PASS 0: Payload Type Resolution                               │
│  - Looks for payload-generic blocks (Const, Broadcast)              │
│  - Tries to infer payloadType from edges                                 │
│  - Finds NO Const blocks connected to sat/val (they're unconnected!)     │
│  - Result: Nothing to resolve                                            │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  NORMALIZER PASS 1: Default Source Materialization                        │
│  - Finds unconnected inputs with defaultSource                           │
│  - Creates derived Const blocks for sat/val                              │
│  - Params come from defaultSourceConst(): { value: 1.0 }                 │
│  - NO payloadType in params!                                             │
│  - Wires new Const blocks → sat/val inputs                               │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  NORMALIZER PASS 2-3: Adapters, Indexing                                  │
│  - Derived Const blocks pass through with undefined payloadType          │
│  - Outputs: NormalizedPatch                                              │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ↓
═══════════════════════════════════════════════════════════════════════════
                    COMPILER (src/compiler/passes-v2/)
═══════════════════════════════════════════════════════════════════════════
                                 ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  COMPILER PASS 1: Type Constraints (UNIT inference, not PAYLOAD)          │
│  - Resolves units: scalar, phase01, radians, etc.                        │
│  - Does NOT touch payloadType (float vs int vs color)                    │
│  - payloadType must already be resolved before this runs!                │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  COMPILER PASS 2-5: Type Graph, Time, Dependencies, Cycles               │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  COMPILER PASS 6: Block Lowering                                          │
│  - Const.lower() checks: if (payloadType === undefined) throw Error      │
│  - ERROR: "Const block missing payloadType"                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### The Structural Problem

1. **defaultSourceConst()** creates incomplete block params:
   ```typescript
   // src/types/index.ts:260-261
   export function defaultSourceConst(value: unknown): DefaultSource {
     return { blockType: 'Const', output: 'out', params: { value } };
     //                                          ^^^^^ Missing payloadType!
   }
   ```

2. **Pass 1** blindly copies these incomplete params:
   ```typescript
   // src/graph/passes/pass1-default-sources.ts:138
   const params = ds.params ?? {};  // { value: 1.0 } - no payloadType
   ```

3. **Pass 0 cannot retroactively fix** because:
   - It runs BEFORE Pass 1 creates the blocks
   - Even if we reran it, derived Const blocks have no incoming edges to infer from

### Why This Is Architecturally Complex

The problem stems from a fundamental tension:

| Pass 0's Need | Pass 1's Need |
|---------------|---------------|
| Needs to know what blocks exist | Creates blocks dynamically |
| Needs edges to infer types | Creates edges dynamically |
| Must run on complete graph | Runs on incomplete graph |

This is a **chicken-and-egg problem**:
- Pass 0 needs the full graph to resolve types
- Pass 1 creates parts of the graph
- You can't resolve types for blocks that don't exist yet

## Affected Components

### Direct Impact
- `src/graph/passes/index.ts` - Pass orchestration
- `src/graph/passes/pass0-payload-resolution.ts` - Payload inference
- `src/graph/passes/pass1-default-sources.ts` - Block materialization
- `src/types/index.ts` - DefaultSource factory functions
- `src/blocks/signal-blocks.ts` - Const block (payload-generic)
- `src/blocks/field-blocks.ts` - Broadcast block (payload-generic)

### Transitive Impact (all blocks with defaultSourceConst)
- `src/blocks/color-blocks.ts` - HsvToRgb (sat, val defaults)
- `src/blocks/primitive-blocks.ts` - Circle, Rect, Path defaults
- `src/blocks/field-operations-blocks.ts` - Various defaults
- `src/blocks/array-blocks.ts` - Layout defaults
- 20+ additional block files

### Test Impact
- Any test using blocks with `defaultSourceConst` defaults
- Integration tests for compilation pipeline
- Runtime tests that use demo patches

## Solution Evaluation

### Option A: Run Pass 0 Twice (Before and After Pass 1)

**Approach**: Run payload resolution both before and after default source materialization.

```typescript
// In runNormalizationPasses():
const p0a = pass0PayloadResolution(patch);      // Resolve user blocks
const p1 = pass1DefaultSources(p0a);            // Materialize defaults
const p0b = pass0PayloadResolution(p1);         // Resolve derived blocks
const p2Result = pass2Adapters(p0b);
```

**Pros**:
- Minimal code change (3 lines)
- Preserves existing pass semantics
- Works for any payload-generic block in defaults

**Cons**:
- Pass 0 would need to handle already-resolved blocks (skip them)
- Conceptually awkward (passes should run once)
- Doesn't address the root cause (incomplete DefaultSource)

**Risk**: LOW
**Effort**: LOW

### Option B: Pass 1 Infers payloadType During Materialization

**Approach**: When Pass 1 creates a derived Const block, it looks at the target input's type to infer payloadType.

```typescript
// In materializeDefaultSource():
if (ds.blockType === 'Const') {
  // Infer payloadType from target input's expected type
  const targetType = targetInput.type;
  params.payloadType = targetType.payload;  // 'float', 'int', etc.
}
```

**Pros**:
- Fixes the problem at the source (where blocks are created)
- Single pass, no re-running
- payloadType is always correct (derived from target)

**Cons**:
- Pass 1 needs type awareness (currently structural only)
- Violates Pass 1's contract: "NO type/unit inference"
- Couples materialization to type system

**Risk**: MEDIUM (contract violation)
**Effort**: MEDIUM

### Option C: Make defaultSourceConst() Type-Aware

**Approach**: Change `defaultSourceConst()` to require payload type, and update all call sites.

```typescript
// New signature:
export function defaultSourceConst(value: unknown, payloadType: PayloadType): DefaultSource {
  return { blockType: 'Const', output: 'out', params: { value, payloadType } };
}

// Call sites become:
sat: { defaultSource: defaultSourceConst(1.0, 'float') }
```

**Pros**:
- Explicit is better than implicit
- No pass changes needed
- Type safety at definition time

**Cons**:
- Requires updating 50+ call sites
- Redundant: input already declares type, now default also declares it
- DRY violation (type declared twice)

**Risk**: LOW
**Effort**: HIGH (many call sites)

### Option D: Separate Pass 0 into 0a and 0b (RECOMMENDED)

**Approach**: Split payload resolution into two phases:
- **Pass 0a**: Resolve user-created payload-generic blocks
- **Pass 1**: Materialize default sources (creates derived blocks)
- **Pass 0b**: Resolve derived payload-generic blocks (with target type context)

```typescript
export function runNormalizationPasses(patch: Patch): NormalizeResult | NormalizeError {
  // Pass 0a: Resolve user payload-generic blocks
  const p0a = pass0PayloadResolution(patch);

  // Pass 1: Materialize default sources (may create Const blocks)
  const p1 = pass1DefaultSources(p0a);

  // Pass 0b: Resolve derived payload-generic blocks (with target context)
  const p0b = pass0bDerivedPayloadResolution(p1);

  // Pass 2+: Continue normally
  const p2Result = pass2Adapters(p0b);
  ...
}
```

**Pros**:
- Clear separation of concerns
- Pass 0b can use target input type (has edge context)
- Preserves Pass 1's structural-only contract
- Architecturally clean

**Cons**:
- More complex orchestration
- New pass to maintain
- More code than Option A

**Risk**: LOW
**Effort**: MEDIUM

### Option E: Make Const Block Self-Resolving (Fallback)

**Approach**: If payloadType is missing at lowering time, default to 'float'.

```typescript
// In Const block's lower function:
const payloadType = (config?.payloadType as PayloadType) ?? 'float';
```

**Pros**:
- Zero normalization changes
- Works for the common case (most defaults are floats)

**Cons**:
- Wrong for non-float defaults (int, bool, vec2, color)
- Silent fallback hides architectural problem
- Eventually causes type mismatches downstream

**Risk**: HIGH (masks bugs)
**Effort**: VERY LOW

## Recommendation

**Recommended Approach: Option D (Split Pass 0) with Option A as interim fallback**

### Rationale

1. **Option D** is architecturally cleanest:
   - Respects pass contracts (Pass 1 stays structural)
   - Explicit about when resolution happens
   - Works for future payload-generic default sources

2. **Option A** as interim:
   - Can ship immediately to unblock users
   - Low risk, easy to verify
   - Remove once Option D is complete

### Implementation Strategy

**Phase 1 (Immediate - unblock users)**:
- Implement Option A: Run Pass 0 twice
- Add tests to verify derived Const blocks get payloadType
- Document as temporary workaround

**Phase 2 (Architectural fix)**:
- Implement Option D: Split Pass 0 into 0a/0b
- Pass 0b uses edge context for resolution
- Remove the duplicate Pass 0 call
- Update architecture documentation

## Questions for User

1. **Priority**: Is this blocking current work, or can we do the proper architectural fix?
2. **Scope**: Should we also address Broadcast (the other payload-generic block)?
3. **Test Coverage**: Are there existing tests we can use to verify the fix, or do we need new ones?

## Evidence

### Pass Order (from src/graph/passes/index.ts:54-74)
```typescript
export function runNormalizationPasses(patch: Patch): NormalizeResult | NormalizeError {
  // Pass 0: Payload type resolution (for payload-generic blocks)
  const p0 = pass0PayloadResolution(patch);

  // Pass 1: Default source materialization
  const p1 = pass1DefaultSources(p0);
  ...
}
```

### defaultSourceConst (from src/types/index.ts:260-261)
```typescript
export function defaultSourceConst(value: unknown): DefaultSource {
  return { blockType: 'Const', output: 'out', params: { value } };
}
```

### Const block check (from src/blocks/signal-blocks.ts:78-81)
```typescript
if (payloadType === undefined) {
  throw new Error(
    `Const block missing payloadType. Type must be resolved by normalizer before lowering.`
  );
}
```
