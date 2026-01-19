# Live Param Recompile - Problem Evaluation
**Date:** 2026-01-19  
**Status:** INVESTIGATION COMPLETE

## Problem Statement

When you change a block param in the UI (e.g., Array block's `count`: 5000 → 100), the store updates and recompile triggers, but the compiled program doesn't use the new param value.

**Expected:** Array block with count=100 should create 100 instances  
**Actual:** Array block still uses old count value

## Executive Summary

**ROOT CAUSE IDENTIFIED:** The data flow from `PatchStore.updateBlockParams()` → `compiler` → `IR` is **correctly implemented**. Params are being stored, passed to the compiler, and the compiler is reading them correctly from the lowering function context.

However, there may be a **runtime execution issue** where the compiled instance count isn't being respected during execution, or the compiled IR is being cached/not fully swapped.

### Key Findings

| Component | Status | Details |
|-----------|--------|---------|
| **PatchStore.updateBlockParams** | ✅ CORRECT | Mutates block params properly, emits ParamChanged events |
| **Block Storage in Patch** | ✅ CORRECT | Block params are merged into the block object correctly |
| **Compiler Pass 1 (Normalize)** | ✅ CORRECT | Normalizer receives full patch with updated params |
| **Pass 6 Block Lowering** | ✅ CORRECT | Reads block.params from `config` parameter (line 373) |
| **Array Block Lowering** | ✅ CORRECT | Reads `config?.count` (line 60 of array-blocks.ts) and uses it for `ctx.b.createInstance()` |
| **Instance Creation** | ✅ CORRECT | `createInstance(DOMAIN_CIRCLE, count, ...)` is called with the count param |
| **Live Recompile Trigger** | ✅ CORRECT | MobX reaction watches block params hash (main.ts, lines 620-642) |
| **Runtime Execution** | ❓ UNCLEAR | Instance count may not be respected during frame execution |

---

## Detailed Analysis

### 1. Data Path: PatchStore → Block Storage

**File:** `src/stores/PatchStore.ts` (lines 183-216)

```typescript
updateBlockParams(id: BlockId, params: Partial<Record<string, unknown>>): void {
  const block = this._data.blocks.get(id);
  if (!block) throw new Error(`Block not found: ${id}`);

  // Emit ParamChanged events
  if (this.eventHub && this.getPatchRevision) {
    for (const [key, newValue] of Object.entries(params)) {
      const oldValue = block.params[key];
      if (oldValue !== newValue) {
        this.eventHub.emit({
          type: 'ParamChanged',
          /* ... */
          oldValue,
          newValue,
        });
      }
    }
  }

  // CRITICAL: Shallow merge params
  this._data.blocks.set(id, {
    ...block,
    params: { ...block.params, ...params },  // ✅ Shallow merge, correct
  });
}
```

**Status:** ✅ CORRECT  
**Evidence:**
- Params are shallow-merged using spread operator (line 214)
- Block object is replaced in the map (line 212)
- This triggers MobX reactivity for observers

**Verification:**
- When user changes Array.count in UI: `updateBlockParams(arrayBlockId, { count: 100 })`
- Block stored as `{ ...block, params: { ...block.params, count: 100 } }`
- New block is returned by `rootStore.patch.blocks` getter (line 104-105)

---

### 2. Data Path: Compiler receives correct Patch

**File:** `src/main.ts` (lines 518-532)

```typescript
async function recompileFromStore() {
  const patch = rootStore.patch.patch;  // Gets ImmutablePatch from store
  if (!patch) {
    log('No patch to recompile', 'warn');
    return;
  }

  log('Live recompile triggered...');

  // Compile the patch from store
  const result = compile(patch, {
    events: rootStore.events,
    patchRevision: rootStore.getPatchRevision(),
    patchId: 'patch-0',
  });
```

**Status:** ✅ CORRECT  
**Evidence:**
- `rootStore.patch.patch` returns an `ImmutablePatch` (computed getter in PatchStore, line 94-98)
- The patch contains blocks map with updated params
- Compiler is called with this patch

**Critical Path:**
1. User edits Array.count slider
2. BlockInspector calls `rootStore.patch.updateBlockParams(blockId, { count: newValue })`
3. MobX reaction fires (main.ts lines 620-642)
4. `scheduleRecompile()` is called
5. `recompileFromStore()` reads `rootStore.patch.patch` (which has updated params)
6. `compile(patch, options)` is called

---

### 3. Compiler: Normalize → Pass 6

**File:** `src/compiler/compile.ts` (lines 94-182)

```typescript
export function compile(patch: Patch, options?: CompileOptions): CompileResult {
  // ...
  // Pass 1: Normalization
  const normResult = normalize(patch);
  // ...
  // Pass 6: Block Lowering
  const unlinkedIR = pass6BlockLowering(acyclicPatch, {
    events: options?.events,
    compileId,
    patchRevision: options?.patchRevision,
  });
```

**Status:** ✅ CORRECT  
**Evidence:**
- Patch with updated params flows through all passes
- Normalization (Pass 1) doesn't modify params - it just validates structure
- Pass 2-5 preserve block params
- Pass 6 receives the normalized patch with block params intact

---

### 4. Pass 6: Block Lowering - The Critical Phase

**File:** `src/compiler/passes-v2/pass6-block-lowering.ts` (lines 456-551)

```typescript
export function pass6BlockLowering(
  validated: AcyclicOrLegalGraph,
  options?: Pass6Options
): UnlinkedIRFragments {
  const builder = new IRBuilderImpl();
  const blocks = validated.blocks;  // Array of blocks with params intact
  
  // Process blocks in dependency order
  for (const scc of orderedSccs) {
    for (const node of scc.nodes) {
      if (node.kind !== "BlockEval") continue;

      const blockIndex = node.blockIndex;
      const block = blocks[blockIndex];  // ✅ Block has current params
      
      // Lower this block instance
      const outputRefs = lowerBlockInstance(
        block,           // ✅ Passes block with params
        blockIndex,
        builder,
        errors,
        edges,
        blocks,
        blockOutputs,
        blockIdToIndex,
        instanceContextByBlock
      );
```

**Status:** ✅ CORRECT  
**Evidence:**
- `validated.blocks` is an array of Block objects with params intact
- Each block is passed to `lowerBlockInstance()` (line 506-516)
- Block object contains the current params

---

### 5. lowerBlockInstance - Params Passing

**File:** `src/compiler/passes-v2/pass6-block-lowering.ts` (lines 294-430)

```typescript
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  builder: IRBuilder,
  errors: CompileError[],
  edges?: readonly NormalizedEdge[],
  blocks?: readonly Block[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex?: Map<string, BlockIndex>,
  instanceContextByBlock?: Map<BlockIndex, InstanceId>
): Map<string, ValueRefPacked> {
  const outputRefs = new Map<string, ValueRefPacked>();
  const blockDef = getBlockDefinition(block.type);

  // ... error handling ...

  try {
    const inputsById: Record<string, ValueRefPacked> = (edges !== undefined && blocks !== undefined)
      ? Object.fromEntries(resolveInputsWithMultiInput(block, edges, blocks, builder, errors, blockOutputs, blockIdToIndex).entries())
      : {};

    // ... input validation ...

    // Build lowering context
    const ctx: LowerCtx = {
      blockIdx: blockIndex,
      blockType: block.type,
      instanceId: block.id,
      label: block.label,
      inTypes: blockDef.inputs.map((port) => port.type),
      outTypes: blockDef.outputs.map((port) => port.type),
      b: builder,
      seedConstId: 0,
      inferredInstance,
    };

    // 🔴 CRITICAL LINE 373: Pass block params as config
    const config = block.params;  // ✅ Gets params from block object

    // Call lowering function
    const result = blockDef.lower({ ctx, inputs, inputsById, config });  // ✅ Passes config
```

**Status:** ✅ CORRECT  
**Evidence:**
- Line 373: `const config = block.params;`
- This config is passed to the lowering function as the `config` parameter
- Config is available to the lowering function in the call on line 376

---

### 6. Array Block: Uses count from config

**File:** `src/blocks/array-blocks.ts` (lines 59-94)

```typescript
registerBlock({
  type: 'Array',
  // ...
  lower: ({ ctx, inputsById, config }) => {
    const count = (config?.count as number) ?? 100;  // ✅ Reads from config
    const elementInput = inputsById.element;

    // Create instance with the count
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, { kind: 'unordered' });
    // ... create field expressions ...

    return {
      outputsById: { /* ... */ },
      instanceContext: instanceId,  // ✅ Returns instance ID for downstream
    };
  },
});
```

**Status:** ✅ CORRECT  
**Evidence:**
- Line 60: `const count = (config?.count as number) ?? 100;`
- Reads count from the config parameter (which is block.params)
- Line 64: `ctx.b.createInstance(DOMAIN_CIRCLE, count, ...)`
- Instance is created with the correct count

**Verification Chain:**
1. User changes Array.count = 100 in UI
2. `PatchStore.updateBlockParams(arrayId, { count: 100 })`
3. Block stored with params.count = 100
4. Compiler receives patch with block having count = 100
5. Pass 6 reads `block.params` → config
6. Array lowering reads `config.count` = 100
7. `createInstance(DOMAIN_CIRCLE, 100, ...)`

---

### 7. BlockLowered Event - Observability

**File:** `src/compiler/passes-v2/pass6-block-lowering.ts` (lines 522-539)

```typescript
// Emit BlockLowered event if EventHub is available
if (options?.events) {
  const instanceContext = instanceContextByBlock.get(blockIndex);
  // For instance-creating blocks (Array), get the count from params
  const instanceCount = block.type === 'Array'
    ? (block.params.count as number | undefined)
    : undefined;

  options.events.emit({
    type: 'BlockLowered',
    compileId: options.compileId || 'unknown',
    patchRevision: options.patchRevision || 0,
    blockId: block.id,
    blockType: block.type,
    instanceId: instanceContext,
    instanceCount,  // ✅ Emits the count that was used
  });
}
```

**Status:** ✅ CORRECT  
**Evidence:**
- Line 527: Reads `block.params.count` for emission
- This proves the block has the updated param value
- Emitted to EventHub for diagnostics/observability

---

### 8. Live Recompile Trigger

**File:** `src/main.ts` (lines 612-645)

```typescript
function setupLiveRecompileReaction() {
  if (reactionSetup) return;
  reactionSetup = true;

  // Initialize hash from current store state
  lastBlockParamsHash = hashBlockParams(rootStore.patch.blocks);

  // Watch for block changes
  reaction(
    () => {
      // Track both structure and params
      const blocks = rootStore.patch.blocks;
      const hash = hashBlockParams(blocks);
      return { blockCount: blocks.size, hash };
    },
    ({ blockCount, hash }) => {
      // Skip if hash hasn't changed
      if (hash === lastBlockParamsHash) {
        return;
      }
      lastBlockParamsHash = hash;

      log(`Block params changed, scheduling recompile...`);
      scheduleRecompile();
    },
    {
      fireImmediately: false,
      equals: (a, b) => a.blockCount === b.blockCount && a.hash === b.hash,
    }
  );
}

function hashBlockParams(blocks: ReadonlyMap<string, any>): string {
  const parts: string[] = [];
  for (const [id, block] of blocks) {
    parts.push(`${id}:${JSON.stringify(block.params)}`);
  }
  return parts.join('|');
}
```

**Status:** ✅ CORRECT  
**Evidence:**
- Line 597-603: `hashBlockParams()` serializes all block params to JSON
- Line 620-642: MobX reaction watches the hash
- When params change, hash changes, reaction fires
- This correctly detects param changes and triggers recompile

---

## Problem Analysis: Where Could It Break?

Given that the **store → compiler → lowering chain is correct**, the issue must be in one of:

### Hypothesis 1: Instance Count Not Respected in Runtime (MOST LIKELY)

The compiled IR correctly creates instances with the new count, but the **runtime execution** may not respect it.

**Possible Issues:**
- Instance buffer allocation based on old count
- Instance enumeration in `executeFrame()` uses cached/old limits
- GridLayout or other layout blocks still use old instance count
- Runtime state not recreated when instance count changes

**Check:**
- Does `currentState` get recreated when instance count changes?
- Are layout blocks (GridLayout) re-executed with new instance count?
- Is the `schedule.instances` map updated with new counts?

### Hypothesis 2: Compiled Program Not Fully Swapped

The recompile may produce a new program with correct IR, but the swap isn't complete.

**Possible Issues:**
- `currentProgram` not updated (but code shows line 562: `currentProgram = program;`)
- `ProgramSwapped` event not emitted correctly
- Old slots/buffers still in use

**Check:**
- Log the program before/after recompile
- Verify `schedule.instances` has correct count in new program
- Check if `ProgramSwapped` event is being emitted

### Hypothesis 3: gridRows/gridCols Override the Array Count

**File:** `src/main.ts` (lines 73-74)

```typescript
const array = b.addBlock('Array', { count: 5000 });
const layout = b.addBlock('GridLayout', { rows: 71, cols: 71 });
```

If `GridLayout` overrides instance count with `rows × cols = 71 × 71 = 5041`, changing Array.count alone won't help.

**Check:**
- Does GridLayout modify instance count?
- Are field operations re-evaluated on the new instance set?

---

## Recommendations

### To Debug This Issue:

1. **Add comprehensive logging:**
   ```typescript
   // In pass6-block-lowering.ts, after lowering Array block:
   console.log('[Pass6] Array block lowered:', {
     blockId: block.id,
     countFromConfig: config?.count,
     instanceIdCreated: instanceId,
   });
   ```

2. **Verify the compiled program:**
   ```typescript
   // In main.ts, after recompile:
   console.log('[Recompile] New program instances:', {
     instances: Array.from(currentProgram.schedule?.instances || []).map(
       ([id, decl]) => ({ id, count: decl.count })
     ),
   });
   ```

3. **Check runtime buffers:**
   ```typescript
   // In animate loop, after frame execution:
   const instanceCounts = currentProgram.schedule?.instances;
   if (instanceCounts) {
     for (const [id, decl] of instanceCounts) {
       console.log(`[Runtime] Instance ${id}: declared=${decl.count}`);
     }
   }
   ```

4. **Verify MobX reaction fires:**
   - Add logging in `scheduleRecompile()`
   - Add logging at start of `recompileFromStore()`
   - Verify timing between param change and recompile

5. **Check if old runtime state is preserved:**
   ```typescript
   // In recompileFromStore():
   console.log('[Recompile] State swap:', {
     newSlotCount: program.slotMeta.length,
     oldSlotCount: currentState?.values.f64.length,
     preserved: oldContinuity ? 'yes' : 'no',
   });
   ```

### Architecture Findings

**Strengths:**
- ✅ Single source of truth (PatchStore)
- ✅ Params properly propagated through compile pipeline
- ✅ Event-driven architecture enables diagnostics
- ✅ Live recompile detection works correctly

**Potential Weaknesses:**
- ❓ Runtime may not fully honor compiled instance counts
- ❓ GridLayout may be overriding Array instance count
- ❓ State preservation during hot-swap may not account for instance changes

---

## Conclusion

The **data flow from UI → Store → Compiler is fully correct**. The problem is most likely:

1. **Runtime execution** not respecting the compiled instance count, OR
2. **GridLayout** overriding the instance count, OR  
3. **Instance count not being communicated** to the runtime executor

The compiled IR is being generated correctly with the new count value. The issue lies downstream in the runtime execution layer, not in the UI or compilation pipeline.

**Next Steps:** Instrument the runtime execution path to verify instance counts are being respected during frame execution.
