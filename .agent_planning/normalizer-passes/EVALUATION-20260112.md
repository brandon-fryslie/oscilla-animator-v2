# Normalizer Pass Refactoring Evaluation

**Date**: 2026-01-12  
**Scope**: Evaluate refactoring `src/graph/normalize.ts` into explicit passes matching `src/compiler/passes-v2/` pattern  
**Status**: Analysis Complete

---

## Executive Summary

The normalizer should be refactored into **explicit, sequential passes** (Pass 0 through Pass 1) that align with the existing compiler pipeline pattern. This evaluation identifies:

1. **Current State**: Four phases inlined in one 607-line module
2. **Target State**: Two separate pass files following the pass-v2 pattern
3. **Architecture Decision**: Passes should live in `src/compiler/passes-v2/` (not `src/graph/passes/`) as they are part of the compilation pipeline
4. **Integration Point**: Clean handoff: `Patch → NormalizedPatch → TypedPatch (Pass 2)`
5. **Key Constraint**: No back-edges or mutations—each pass produces a new, immutable representation

---

## Current State Analysis

### Structure of `src/graph/normalize.ts` (607 lines)

The normalizer performs four sequential phases inline:

| Phase | Name | Input | Output | Lines | Purpose |
|-------|------|-------|--------|-------|---------|
| 0 | Polymorphic Type Resolution | `Patch` | `Patch` | ~100 | Resolve `'???'` types via bidirectional inference |
| 1 | Default Source Materialization | `Patch` | `Patch` | ~150 | Insert derived Const blocks for unconnected inputs |
| 2 | Adapter Insertion | `Patch` | `Patch` | ~150 | Insert adapter blocks between type-mismatched edges |
| 3 | Indexing & Normalization | `Patch` | `NormalizedPatch` | ~150 | Build dense block indices and normalize edges |

### Key Responsibilities by Phase

**Phase 0: `resolvePolymorphicTypes(patch: Patch): Patch`**
- Forward resolution: polymorphic output infers type from target input
- Backward resolution: polymorphic input infers type from source output
- Updates block params with inferred `payloadType`
- Single-pass algorithm (no fixpoint iteration)

**Phase 1: `analyzeDefaultSources() + applyDefaultSourceInsertions()`**
- Identifies unconnected inputs with `defaultSource` metadata
- Creates derived Const blocks (currently uses polymorphic `Const` block)
- Generates deterministic block IDs: `_ds_{blockId}_{portId}`
- Produces blocks + edges for insertion

**Phase 2: `analyzeAdapters() + applyAdapterInsertions()`**
- Detects type mismatches on edges
- Looks up adapters from registry (currently only `FieldBroadcast`)
- Creates adapter blocks with polymorphic type resolution
- Generates deterministic adapter IDs: `_adapter_{edgeId}`
- Replaces original edges with adapter-mediated paths

**Phase 3: Index Building & Edge Normalization**
- Sorts blocks by ID for deterministic ordering
- Builds `BlockIndex` map (BlockId → dense index)
- Converts edge references from BlockId to BlockIndex
- Sorts edges for deterministic ordering (by target, then source)
- Filters disabled edges

### Current Issues

1. **No explicit pass structure**: All phases inlined in one function
2. **Mutation hidden in helpers**: `applyDefaultSourceInsertions()`, `applyAdapterInsertions()` return new patches but pattern is inconsistent with compiler passes
3. **Error handling inconsistent**: Errors collected for phases 2+ but phases 0–1 fail silently
4. **Phase 3 buried**: Indexing and edge normalization happens inline without clear boundary
5. **No intermediate IR types**: Unlike compiler passes, no explicit types for phase outputs (only final `NormalizedPatch`)

---

## Existing Compiler Pipeline Pattern

### Pass Structure in `src/compiler/passes-v2/`

All passes follow a consistent pattern:

```typescript
// File naming: pass{N}-{description}.ts
export function pass{N}{Description}(input: InputType): OutputType {
  // Validate input
  // Transform
  // Return new representation (never mutate)
}

// Error types scoped to pass:
export class Pass{N}Error extends Error { ... }
export interface Pass{N}SomeError { kind: "SomeError"; ... }
export type Pass{N}Error = Pass{N}SomeError | ...;
```

**Key Pattern Features**:
- Single `pass{N}` function (not split into analyze/apply)
- Explicit error types with `kind` discriminator
- Immutable: returns new object, never mutates input
- No back-edges: downstream passes never reference upstream IRs
- Clear input/output types

**Existing passes**:
- Pass 2: `Patch → TypedPatch` (type resolution)
- Pass 3: `TypedPatch → TimeResolvedPatch` (time model)
- Pass 4: `TimeResolvedPatch → DepGraphWithTimeModel` (dependency graph)
- Pass 5: `DepGraphWithTimeModel → AcyclicOrLegalGraph` (cycle validation)
- Pass 6: `AcyclicOrLegalGraph → UnlinkedIRFragments` (block lowering)
- Pass 7: `UnlinkedIRFragments → ScheduleIR` (schedule construction)
- Pass 8: Stub (link resolution)

### Integration in `src/compiler/compile.ts`

The compilation pipeline is orchestrated as a linear sequence:

```typescript
export function compile(patch: Patch, options?: CompileOptions): CompileResult {
  // Pass 1: Normalization
  const normResult = normalize(patch);
  if (normResult.kind === 'error') { ... }
  const normalized = normResult.patch;

  // Pass 2: Type Graph
  const typedPatch = pass2TypeGraph(normalized);

  // Pass 3: Time Topology
  const timeResolvedPatch = pass3Time(typedPatch);

  // Pass 4-7: ... (sequential)
}
```

**Current Problem**: Normalization is called separately, not as part of the pipeline structure.

---

## Proposed Refactoring

### Architecture Decision: Location and Naming

**Decision**: Passes should be **Pass 0 and Pass 1** in `src/compiler/passes-v2/` (NOT `src/graph/passes/`)

**Rationale**:
- Normalizer is part of the **compilation pipeline**, not a separate graph tool
- Pass numbering is global: 0, 1, 2, ..., 8
- Centralized pipeline in `compile.ts` becomes: `normalize (pass 0+1) → pass2 → ... → pass8`
- Easier to reason about: "normalizer is passes 0–1"

**Not in `src/graph/passes/`** because:
- Graph utilities (index builders, edge queries) are different from compilation passes
- Passes have specific error semantics and pipeline contracts
- `src/graph/` should remain a low-level IR layer, not compilation logic

### Pass 0: Polymorphic Type Resolution

**File**: `src/compiler/passes-v2/pass0-polymorphic-types.ts`

**Signature**:
```typescript
export function pass0PolymorphicTypes(patch: Patch): Patch
```

**Input**: Raw `Patch` (user graph)
**Output**: `Patch` (with resolved `payloadType` params)

**Responsibilities**:
- Resolve `'???'` types via bidirectional propagation
- Update block params with inferred types
- No structural changes (no blocks/edges added)

**Errors**: None thrown—polymorphic types remain unresolved if inference fails

**Example**:
```
Const (type='???') → Oscillator (expects float)
⟹ Const.params.payloadType = 'float'
```

### Pass 1: Default Sources + Adapters

**File**: `src/compiler/passes-v2/pass1-default-sources-adapters.ts`

**Signature**:
```typescript
export function pass1DefaultSourcesAndAdapters(
  patch: Patch
): NormalizeResult
```

**Input**: `Patch` (with resolved polymorphic types from Pass 0)
**Output**: `NormalizeResult = { kind: 'ok'; patch: NormalizedPatch } | { kind: 'error'; errors }`

**Responsibilities**:
1. Insert default source blocks (Const, etc.)
2. Insert adapter blocks (FieldBroadcast, etc.)
3. Build block index and convert edges to indexed form
4. Validate structure and collect errors

**Error Types**:
```typescript
export interface NormalizeError {
  readonly kind: 'error';
  readonly errors: readonly NormError[];
}

export type NormError =
  | { kind: 'DanglingEdge'; edge: Edge; missing: 'from' | 'to' }
  | { kind: 'DuplicateBlockId'; id: BlockId }
  | { kind: 'UnknownBlockType'; blockId: BlockId; blockType: string }
  | { kind: 'UnknownPort'; blockId: BlockId; portId: string; direction: 'input' | 'output' }
  | { kind: 'NoAdapterFound'; edge: Edge; fromType: string; toType: string };
```

### Integration Point

**New `src/compiler/compile.ts` flow**:
```typescript
export function compile(patch: Patch, options?: CompileOptions): CompileResult {
  const startTime = performance.now();

  // Emit CompileBegin
  if (options) { options.events.emit({ type: 'CompileBegin', ... }); }

  try {
    // Pass 0: Polymorphic Type Resolution
    const patchWithResolvedTypes = pass0PolymorphicTypes(patch);

    // Pass 1: Default Sources + Adapters + Indexing
    const normResult = pass1DefaultSourcesAndAdapters(patchWithResolvedTypes);

    if (normResult.kind === 'error') {
      return emitFailure(options, startTime, compileId, convertNormErrorsToCompileErrors(normResult.errors));
    }

    const normalized = normResult.patch;

    // Pass 2: Type Graph
    const typedPatch = pass2TypeGraph(normalized);

    // Pass 3-7: ... (unchanged)
  } catch (e) { ... }
}
```

### Intermediate Representation Types

No new IR types needed—phases remain:

```typescript
Patch
  → (Pass 0) → Patch (with payloadType resolved)
  → (Pass 1) → NormalizedPatch (indexed edges)
  → (Pass 2) → TypedPatch
  → (Pass 3) → TimeResolvedPatch
  → ...
```

The only "new" IR is the intermediate `Patch` state between Pass 0 and Pass 1, which is implicit (not typed separately).

---

## Detailed Design

### Pass 0: Implementation Strategy

```typescript
/**
 * Pass 0: Polymorphic Type Resolution
 *
 * Resolves '???' (polymorphic) types by propagating concrete types
 * bidirectionally through edges.
 *
 * Strategy:
 * 1. Forward (output → target input): infer from what polymorphic output connects to
 * 2. Backward (source output → input): infer from what feeds into polymorphic input
 *
 * Returns patch with updated block params (payloadType set).
 */
export function pass0PolymorphicTypes(patch: Patch): Patch {
  const updatedBlocks = new Map(patch.blocks);

  for (const [blockId, block] of patch.blocks) {
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    // Already resolved?
    if (block.params.payloadType !== undefined) continue;

    let inferredPayloadType: string | undefined;

    // Strategy 1: Forward resolution
    for (const output of blockDef.outputs) {
      if (output.type.payload !== '???') continue;
      const outgoingEdge = patch.edges.find(
        e => e.enabled !== false &&
             e.from.blockId === blockId &&
             e.from.slotId === output.id
      );
      if (!outgoingEdge) continue;

      const targetBlock = patch.blocks.get(outgoingEdge.to.blockId as BlockId);
      if (!targetBlock) continue;

      const targetDef = getBlockDefinition(targetBlock.type);
      if (!targetDef) continue;

      const targetInput = targetDef.inputs.find(i => i.id === outgoingEdge.to.slotId);
      if (!targetInput || targetInput.type.payload === '???') continue;

      inferredPayloadType = targetInput.type.payload;
      break;
    }

    // Strategy 2: Backward resolution
    if (!inferredPayloadType) {
      for (const input of blockDef.inputs) {
        if (input.type.payload !== '???') continue;
        const incomingEdge = patch.edges.find(
          e => e.enabled !== false &&
               e.to.blockId === blockId &&
               e.to.slotId === input.id
        );
        if (!incomingEdge) continue;

        const sourceBlock = patch.blocks.get(incomingEdge.from.blockId as BlockId);
        if (!sourceBlock) continue;

        const sourceDef = getBlockDefinition(sourceBlock.type);
        if (!sourceDef) continue;

        const sourceOutput = sourceDef.outputs.find(o => o.id === incomingEdge.from.slotId);
        if (!sourceOutput) continue;

        // Handle already-resolved polymorphic sources
        if (sourceOutput.type.payload === '???') {
          const resolvedPayload = sourceBlock.params.payloadType ||
                                  updatedBlocks.get(sourceBlock.id)?.params.payloadType;
          if (resolvedPayload && resolvedPayload !== '???') {
            inferredPayloadType = resolvedPayload as string;
            break;
          }
          continue;
        }

        inferredPayloadType = sourceOutput.type.payload;
        break;
      }
    }

    // Update block if type was inferred
    if (inferredPayloadType) {
      const updatedBlock: Block = {
        ...block,
        params: {
          ...block.params,
          payloadType: inferredPayloadType,
        },
      };
      updatedBlocks.set(blockId, updatedBlock);
    }
  }

  return {
    blocks: updatedBlocks,
    edges: patch.edges,
  };
}
```

**Key Points**:
- No errors thrown (polymorphic types stay `'???'` if unresolved)
- Single-pass algorithm (no fixpoint iteration needed)
- Returns new `Patch`, never mutates input
- Does NOT change blocks/edges structure

### Pass 1: Implementation Strategy

```typescript
/**
 * Pass 1: Default Sources + Adapter Insertion + Indexing
 *
 * Combines three transformations:
 * 1. Materialize default sources (insert Const blocks)
 * 2. Insert adapters for type mismatches
 * 3. Build dense block index and convert edges
 *
 * Returns NormalizedPatch or errors.
 */
export function pass1DefaultSourcesAndAdapters(patch: Patch): NormalizeResult | NormalizeError {
  const errors: NormError[] = [];

  // Step 1: Materialize default sources
  const defaultSourceInsertions = analyzeDefaultSources(patch);
  const patchWithDefaults = applyDefaultSourceInsertions(patch, defaultSourceInsertions);

  // Step 2: Insert adapters
  const adapterInsertions = analyzeAdapters(patchWithDefaults, errors);
  const expandedPatch = applyAdapterInsertions(patchWithDefaults, adapterInsertions);

  // Step 3: Build block index and normalize edges
  const blockIndex = new Map<BlockId, BlockIndex>();
  const blocks: Block[] = [];

  // Sort blocks deterministically
  const sortedBlockIds = [...expandedPatch.blocks.keys()].sort();

  for (const id of sortedBlockIds) {
    if (blockIndex.has(id)) {
      errors.push({ kind: 'DuplicateBlockId', id });
      continue;
    }
    const index = blocks.length as BlockIndex;
    blockIndex.set(id, index);
    blocks.push(expandedPatch.blocks.get(id)!);
  }

  // Normalize edges
  const normalizedEdges: NormalizedEdge[] = [];

  for (const edge of expandedPatch.edges) {
    if (edge.enabled === false) continue;

    const fromIdx = blockIndex.get(edge.from.blockId as BlockId);
    const toIdx = blockIndex.get(edge.to.blockId as BlockId);

    if (fromIdx === undefined) {
      errors.push({ kind: 'DanglingEdge', edge, missing: 'from' });
      continue;
    }
    if (toIdx === undefined) {
      errors.push({ kind: 'DanglingEdge', edge, missing: 'to' });
      continue;
    }

    normalizedEdges.push({
      fromBlock: fromIdx,
      fromPort: edge.from.slotId as PortId,
      toBlock: toIdx,
      toPort: edge.to.slotId as PortId,
    });
  }

  // Sort edges deterministically
  normalizedEdges.sort((a, b) => {
    if (a.toBlock !== b.toBlock) return a.toBlock - b.toBlock;
    if (a.toPort !== b.toPort) return a.toPort.localeCompare(b.toPort);
    if (a.fromBlock !== b.fromBlock) return a.fromBlock - b.fromBlock;
    return a.fromPort.localeCompare(b.fromPort);
  });

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return {
    kind: 'ok',
    patch: {
      patch, // Original patch for reference
      blockIndex,
      blocks,
      edges: normalizedEdges,
    },
  };
}
```

**Key Points**:
- Two-step structure: analyze → apply (same as current code)
- Errors collected and returned as `NormalizeError`, not thrown
- Single return type: `NormalizeResult | NormalizeError` (discriminated union)
- Produces immutable `NormalizedPatch`

---

## Ambiguities & Decisions

### 1. Pass 0 Needs Fixpoint Iteration?

**Question**: Should polymorphic type resolution iterate until fixpoint?

**Current Implementation**: Single pass (no fixpoint)

**Analysis**:
- Example: `Const1 (???) → MulBy2 (?) → Add (?, ?) → SomeBlock (float)`
  - Forward: `MulBy2` output is `?`, but what does it connect to?
  - The current code would only resolve `Const1` if it directly connects to a non-`???` type
- If `MulBy2` is polymorphic, we'd need to resolve it first, which requires its output to be resolved

**Recommendation**: **No fixpoint needed yet**
- Block definitions should use non-polymorphic output signatures where possible
- Polymorphic adapters (FieldBroadcast) will have their type resolved from source in Pass 1
- If complex chains of polymorphic blocks are needed later, add fixpoint then (requires test case)

### 2. Should Pass 0 Errors Be Reported?

**Question**: What if polymorphic types cannot be resolved?

**Current Behavior**: Silently leaves them as `'???'` (Pass 2 type-check will catch)

**Recommendation**: **Keep current behavior**
- Pass 2 (type graph) will fail with more specific error
- No need for early-stage errors here
- Keeps Pass 0 simple (transforms, no validation)

### 3. Default Source Kind='rail' Not Implemented

**Question**: How to handle phaseA/phaseB default sources?

**Current Code**: Comment says "TODO: Handle 'rail' kind"

**Recommendation**: **Leave as TODO**
- Requires deeper time-model integration
- Can be added after Pass 1 is solid
- Tests will reveal necessity

### 4. Should We Recursively Resolve Nested Polymorphic Blocks?

**Question**: If a Const block's type is inferred, and it feeds into a polymorphic FieldBroadcast, should FieldBroadcast's type be auto-resolved?

**Current Behavior**: FieldBroadcast's type is resolved in Pass 1 adapter insertion

**Recommendation**: **Keep separate**
- Pass 0: resolves polymorphic types from their connections
- Pass 1: resolves polymorphic adapters from their input types
- Clean separation of concerns

### 5. Pass 1 Should Still Accept Unresolved Polymorphic Types?

**Question**: If Pass 0 leaves some `'???'` types unresolved, how should Pass 1 handle them?

**Answer**: Yes, Pass 1 should handle unresolved types gracefully
- `getPortType()` will return type with `payload: '???'`
- Adapter lookup will use `'???'` in signature matching (matches any payload)
- This is correct for polymorphic adapters

---

## Files to Create/Modify

### Files to Create

1. **`src/compiler/passes-v2/pass0-polymorphic-types.ts`** (new)
   - Extract `resolvePolymorphicTypes()` from normalize.ts
   - Wrap in `pass0PolymorphicTypes()` function
   - No error types needed

2. **`src/compiler/passes-v2/pass1-default-sources-adapters.ts`** (new)
   - Extract phases 1–3 from normalize.ts
   - Wrap in `pass1DefaultSourcesAndAdapters()` function
   - Export `NormError` type and other error types
   - Re-export `NormalizedPatch` types

### Files to Modify

3. **`src/compiler/passes-v2/index.ts`**
   - Add exports for Pass 0 and Pass 1
   - Update comment to list all 9 passes (0–8)

4. **`src/compiler/compile.ts`**
   - Import Pass 0 and Pass 1 functions
   - Update pipeline to call `pass0PolymorphicTypes()` then `pass1DefaultSourcesAndAdapters()`
   - Update error handling for normalize

5. **`src/graph/normalize.ts`**
   - Keep as-is for backward compatibility (re-export from passes-v2)
   - Or deprecate and have callers use compile.ts pipeline

### Files NOT Modified

- **`src/graph/`**: Remains a low-level IR layer (blocks, edges, queries)
- **`src/compiler/ir/patches.ts`**: IR types unchanged (just threads through NormalizedPatch)
- **Block registry**: No changes

---

## Dependencies & Ordering Constraints

### Pass 0 Dependencies
- Input: `Patch` (from user/editor)
- Dependencies: `getBlockDefinition()` (block registry)
- No dependencies on compiler passes

### Pass 1 Dependencies
- Input: `Patch` (output of Pass 0)
- Dependencies: `getBlockDefinition()`, `findAdapter()`, block registry
- Produces: `NormalizedPatch` (consumed by Pass 2)

### Ordering
```
User Graph (Patch)
    ↓ [Pass 0: Polymorphic Type Resolution]
Patch (with resolved payloadTypes)
    ↓ [Pass 1: Default Sources + Adapters + Indexing]
NormalizedPatch (with indices)
    ↓ [Pass 2: Type Graph Construction]
TypedPatch
    ↓ [Pass 3–7: existing passes]
...
```

**No back-edges**: Each pass only consumes from previous, never references later IR.

---

## Risk Analysis

### Risk 1: Breaking Changes to Normalize Export

**If**: Current code calls `normalize()` directly  
**Then**: Will break when we move it  
**Mitigation**:
- Keep `normalize()` export in `src/graph/normalize.ts`
- Have it call through to compile.ts pipeline (or just Passes 0+1)
- Deprecate in favor of pipeline

**Current Usage**:
```bash
grep -r "import.*normalize" src/ --include="*.ts"
```
→ Only `src/compiler/compile.ts` imports it
→ Safe to refactor!

### Risk 2: Normalize Returns Multiple Error Types

**Current**: `NormalizeError` with discriminated `errors` array  
**Compiler**: Expects unified error types  
**Mitigation**:
- Pass 1 returns `NormalizeError` directly
- `compile.ts` converts `NormError[]` to `CompileError[]` in one place
- Use helper: `convertNormalizeErrorsToCompileErrors()`

### Risk 3: Adapter Block Polymorphic Type Setting

**Current Code**: Sets adapter block `payloadType` from source type  
**Risk**: What if source type is still `'???'`?  
**Analysis**:
- Pass 0 resolves source before Pass 1 runs
- If source is still `'???'`, adapter also gets `'???'`
- Pass 2 type-check will validate compatibility
- This is **safe**

---

## Implementation Checklist

- [ ] Create `pass0-polymorphic-types.ts`
- [ ] Create `pass1-default-sources-adapters.ts`
- [ ] Update `passes-v2/index.ts` exports
- [ ] Update `compile.ts` to use Pass 0 + Pass 1
- [ ] Test Pass 0 independently (polymorphic type resolution)
- [ ] Test Pass 1 independently (default sources, adapters, indexing)
- [ ] Test full pipeline integration
- [ ] Update `src/graph/normalize.ts` comments (or deprecate)
- [ ] Verify no code breaks (grep for `normalize` imports)
- [ ] Update architecture docs

---

## Unresolved Questions

1. **Should Pass 0 do multiple iterations?**  
   → Answer: No, single pass sufficient (add fixpoint if needed later)

2. **Where should normalization error conversion happen?**  
   → Answer: In `compile.ts` after Pass 1 returns (one place)

3. **Should we split Pass 1 further?**  
   → Answer: No, all three sub-phases (defaults, adapters, indexing) are interdependent

4. **What about the 'rail' kind default sources?**  
   → Answer: Leave as TODO, requires time-model design

5. **Should normalized edges retain original edge IDs?**  
   → Answer: No, NormalizedEdge uses indices (can reconstruct via blockIndex lookup if needed)

---

## Summary

The refactoring is **feasible and recommended** because:

1. **Clean separation**: Passes 0–1 are distinct transformations with clear inputs/outputs
2. **Pattern alignment**: Follows existing compiler pass structure
3. **Low risk**: Only `compile.ts` imports normalizer currently
4. **Explicit IR**: `NormalizedPatch` becomes first official compiled IR (feeds to Pass 2)
5. **Ordering guarantee**: No back-edges, pure data flow
6. **Error handling**: Unified error collection (matches Pass 2+ pattern)

The normalizer is conceptually already a multi-pass system—this refactoring makes that structure explicit.
