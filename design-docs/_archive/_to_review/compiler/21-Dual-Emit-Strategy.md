# Dual-Emit Compilation Strategy (Sprint 2)

**Status:** Implemented (Sprint 2, Phase 3)
**Date:** 2025-12-25
**References:**
- `15-Canonical-Lowering-Pipeline.md` § Passes 6-8
- `16-Block-Lowering.md` § Future Work
- `.agent_planning/phase3-ir-integration/PLAN-2025-12-25-200731.md`

---

## Overview

Sprint 2 implements **dual-emit compilation**: the compiler emits both **legacy closure-based Artifacts** (for immediate execution) AND **IR nodes** (for validation and future migration). This bridges the gap between the current closure-based runtime and the future IR-based runtime without requiring immediate changes to block compilers.

### Key Characteristics

1. **Block compilers unchanged** - they still return closure-based Artifacts
2. **IR inferred from closures** - Passes 6-8 translate Artifacts → IR nodes
3. **Opt-in via flag** - `compilePatch(..., { emitIR: true })`
4. **Structural IR only** - IR is not executable yet, but validates structurally
5. **Non-breaking** - existing compilation continues to work unchanged

---

## Architecture

### Compilation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Closure Compilation (Unchanged)                    │
│                                                              │
│ Patch → Passes 1-5 → Block Compilation → Artifact Closures  │
│                                                              │
│ Output: CompiledProgram { program, timeModel }              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: IR Emission (New - when emitIR: true)              │
│                                                              │
│ Artifact Closures → Pass 6-8 → IR Nodes → Validation        │
│                                                              │
│ Output: CompiledProgram { program, timeModel, ir }          │
└─────────────────────────────────────────────────────────────┘
```

### Why Not Modify Block Compilers Yet?

**Risk Management:**
- Changing 50+ block compilers is high-risk
- Closure-based runtime is battle-tested
- IR runtime doesn't exist yet (Phase 4+)

**Migration Path:**
- Sprint 2: Prove IR structure works via inference
- Sprint 3+: Migrate blocks one-by-one to emit IR directly
- Phase 4: Replace closure runtime with IR runtime

---

## Implementation Details

### Pass 6: Block Lowering

**Goal:** Translate compiled Artifact closures into IR nodes.

**Strategy:**
For each block output Artifact, create a corresponding IR node that represents the structure:

```typescript
function artifactToValueRef(artifact: Artifact, builder: IRBuilder): ValueRefPacked {
  switch (artifact.kind) {
    case 'Scalar:number':
      // Scalar constant → IR constant + sigConst node
      const constId = builder.constF64(artifact.value);
      const sigId = builder.sigConst({ world: 'signal', domain: 'number' }, constId);
      return { k: 'sig', id: sigId };

    case 'Signal:number':
    case 'Signal:phase':
    case 'Signal:vec2':
    case 'Signal:color':
      // Signal closure → placeholder sigOp node
      // Future: parse closure to extract actual operations
      const placeholderId = builder.sigOp('identity', [], typeFromKind(artifact.kind));
      return { k: 'sig', id: placeholderId };

    case 'Field:number':
    case 'Field:vec2':
    case 'Field:color':
      // Field closure → placeholder fieldOp node
      const fieldId = builder.fieldOp('identity', [], typeFromKind(artifact.kind));
      return { k: 'field', id: fieldId };

    case 'RenderTree':
    case 'RenderTreeProgram':
      // Special handling - not a signal/field
      return { k: 'special', tag: 'render', id: builder.allocSpecialId() };

    default:
      throw new Error(`Unsupported artifact kind: ${artifact.kind}`);
  }
}
```

**Limitations:**
- IR nodes are **structural placeholders**, not executable
- No semantic equivalence to closure behavior (yet)
- Validates graph topology, not computation correctness

**Integration Point:**
Runs AFTER `compileBusAwarePatch()` completes successfully, using `compiledPortMap` as input.

---

### Pass 7: Bus Lowering

**Goal:** Compile bus values into explicit IR combine nodes.

**Strategy:**
Reuse existing bus semantics from `busSemantics.ts`:
- `getSortedPublishers()` - deterministic publisher ordering
- `combineSignalArtifacts()` / `combineFieldArtifacts()` - combine semantics

Create corresponding IR nodes:

```typescript
function lowerBusToIR(
  bus: Bus,
  publishers: Publisher[],
  blockOutputs: Map<BlockIndex, ValueRefPacked[]>,
  builder: IRBuilder
): ValueRefPacked {
  const sorted = getSortedPublishers(publishers);

  if (sorted.length === 0) {
    // No publishers → use bus default value
    const constId = builder.constFromDefaultValue(bus.defaultValue);
    const sigId = builder.sigConst(bus.type, constId);
    return { k: 'sig', id: sigId };
  }

  // Collect publisher value refs (with adapter/lens transforms)
  const publisherRefs = sorted.map(pub => {
    const sourceRef = blockOutputs.get(pub.from.blockId);
    return applyPublisherTransforms(sourceRef, pub, builder);
  });

  // Create combine node
  if (bus.type.world === 'signal') {
    const combineId = builder.sigCombine(bus.combineMode, publisherRefs, bus.type);
    return { k: 'sig', id: combineId };
  } else {
    const combineId = builder.fieldCombine(bus.combineMode, publisherRefs, bus.type);
    return { k: 'field', id: combineId };
  }
}
```

**Publisher Transform Chains:**

Publishers can have adapter chains and lens stacks. For Sprint 2, we create `TransformChainIR` references:

```typescript
function applyPublisherTransforms(
  sourceRef: ValueRefPacked,
  publisher: Publisher,
  builder: IRBuilder
): ValueRefPacked {
  let current = sourceRef;

  // Apply adapter chain
  if (publisher.adapterChain && publisher.adapterChain.length > 0) {
    const steps = publisher.adapterChain.map(step => ({
      kind: 'adapter',
      adapterId: step.adapterId,
      // adapter-specific params
    }));
    const chainId = builder.transformChain(steps);
    current = builder.applyTransform(current, chainId);
  }

  // Apply lens stack (similar pattern)
  if (publisher.lensStack && publisher.lensStack.length > 0) {
    // ...
  }

  return current;
}
```

---

### Pass 8: Link Resolution

**Goal:** Resolve wire connections and bus listeners into explicit data flow.

**Strategy:**
Replace symbolic references (blockId + slotId) with IR node references:

```typescript
function resolveLinks(
  unlinked: IRWithBusRoots,
  connections: Connection[],
  listeners: Listener[],
  blockOutputs: Map<BlockIndex, ValueRefPacked[]>
): LinkedGraphIR {
  const builder = unlinked.builder;

  for (const conn of connections) {
    const sourceRef = blockOutputs.get(conn.from.blockId)[conn.from.slotIndex];
    const targetSlot = getSlotKey(conn.to.blockId, conn.to.slotId);
    builder.linkSlot(targetSlot, sourceRef);
  }

  for (const listener of listeners) {
    const busRef = unlinked.busRoots.get(listener.busId);
    const targetSlot = getSlotKey(listener.to.blockId, listener.to.slotId);
    builder.linkSlot(targetSlot, busRef);
  }

  return builder.finalize();
}
```

**Result:**
Fully-linked IR graph where every input has a resolved source.

---

### IR Validation

**Goal:** Validate IR structure without executing it.

**Checks:**
1. **Type consistency** - all links respect type compatibility
2. **Bus semantics** - combine modes match bus type (Signal vs Field)
3. **Time topology** - exactly one TimeRoot, valid time model
4. **Graph structure** - no cycles (except legal state feedback)
5. **Default sources** - all unconnected inputs have defaults

**Non-Checks (Sprint 2 limitations):**
- ❌ Semantic equivalence to closures
- ❌ Execution correctness
- ❌ Performance characteristics
- ❌ Field materialization behavior

**Integration:**

```typescript
const validated = validateIR(linkedIR);
if (!validated.ok) {
  // Fatal IR errors → compilation fails
  return { ok: false, errors: validated.errors };
}

if (validated.warnings.length > 0) {
  // Non-fatal warnings → attach to result
  result.irWarnings = validated.warnings;
}
```

---

## Usage

### Enabling IR Emission

```typescript
import { compilePatch } from './compiler/compile';

const result = compilePatch(
  patch,
  registry,
  seed,
  ctx,
  { emitIR: true } // Enable dual-emit
);

if (result.ok) {
  // Closures (always present)
  const program = result.program;
  const timeModel = result.timeModel;

  // IR (present when emitIR: true)
  const ir = result.ir;
  const irWarnings = result.irWarnings;

  // Both are valid!
  // - Runtime uses `program` (closures)
  // - Debugger/validator uses `ir` (IR)
}
```

### CompileResult Type

```typescript
export interface CompileResult {
  ok: boolean;
  program?: Program<RenderTree>;
  canvasProgram?: CanvasProgram;
  timeModel?: TimeModel;
  errors: readonly CompileError[];
  compiledPortMap?: Map<string, Artifact>;

  // Sprint 2: Dual-Emit Integration
  /** Intermediate Representation (when emitIR flag is true) */
  ir?: LinkedGraphIR;
  /** IR compilation warnings (non-fatal IR errors) */
  irWarnings?: readonly CompileError[];
}
```

---

## Examples

### Example 1: Artifact → IR Translation

**Closure Artifact:**
```typescript
const artifact = {
  kind: 'Signal:number',
  value: (t: number) => Math.sin(t / 1000)
};
```

**IR Translation (Sprint 2):**
```typescript
// Placeholder IR node (not executable)
const irNode = {
  kind: 'sigOp',
  op: 'identity', // Placeholder operation
  inputs: [],
  type: { world: 'signal', domain: 'number' }
};
```

**Future (Phase 4):**
```typescript
// Actual semantic IR (executable)
const irNode = {
  kind: 'sigOp',
  op: 'sin',
  inputs: [
    { kind: 'sigOp', op: 'div', inputs: [tRef, constRef(1000)] }
  ],
  type: { world: 'signal', domain: 'number' }
};
```

### Example 2: Bus Combine → IR

**Bus Definition:**
```typescript
const energyBus = {
  id: 'energy',
  name: 'energy',
  type: { world: 'signal', domain: 'number' },
  combineMode: 'sum',
  defaultValue: 0
};
```

**Publishers:**
```typescript
const publishers = [
  { from: 'breathBlock', slot: 'out', sortKey: 10 },
  { from: 'accentBlock', slot: 'env', sortKey: 20 }
];
```

**IR Combine Node:**
```typescript
const combineNode = {
  kind: 'sigCombine',
  mode: 'sum',
  inputs: [
    breathRef,  // from breathBlock.out
    accentRef   // from accentBlock.env
  ],
  type: { world: 'signal', domain: 'number' }
};
```

---

## Testing Strategy

### Golden Patch IR Test

See `src/editor/compiler/__tests__/golden-patch-ir.test.ts`:

```typescript
const result = compilePatch(
  goldenPatch,
  registry,
  seed,
  ctx,
  { emitIR: true }
);

expect(result.ok).toBe(true);
expect(result.program).toBeDefined();  // Closures work
expect(result.ir).toBeDefined();       // IR emitted
expect(result.irWarnings).toBeUndefined(); // No warnings
```

**Validates:**
- ✓ Compilation succeeds with emitIR flag
- ✓ Both program (closures) and IR are emitted
- ✓ IR structure is valid (passes validation)
- ✓ No IR warnings are produced
- ✓ TimeModel matches between closure and IR

---

## Limitations

### Sprint 2 Scope

**What Works:**
- ✓ IR structure emitted from closure compilation
- ✓ IR validates graph topology
- ✓ TimeModel extracted correctly
- ✓ Bus semantics captured in IR
- ✓ Non-breaking opt-in flag

**What Doesn't Work (Yet):**
- ❌ IR is not executable (use closures for runtime)
- ❌ IR nodes are structural placeholders, not semantic
- ❌ No closure → IR semantic equivalence
- ❌ IR-based debugger (Phase 4)
- ❌ IR-based optimization passes (Phase 5+)

### Known Issues

1. **Placeholder Operations**
   IR uses `identity` placeholder for most operations. Future work will parse closures or migrate blocks to emit semantic IR.

2. **Transform Chains**
   Adapter/lens chains create IR references but don't lower to actual operations yet.

3. **Field Materialization**
   Field IR nodes represent logical fields, but materialization strategy (buffers, broadcast/reduce) is not captured.

4. **State Blocks**
   Stateful blocks (Integrate, History) create IR nodes but state semantics are incomplete.

---

## Migration Path (Phase 4+)

### Phase 4: IR Runtime

**Goal:** Replace closure runtime with IR interpreter.

**Steps:**
1. Implement IR evaluator (SignalExpr, FieldExpr)
2. Migrate blocks to emit semantic IR
3. Validate IR ≡ closure behavior via golden tests
4. Flip runtime to use IR by default
5. Remove closure compilation path

**Reference:** `16-Block-Lowering.md` § Block Compiler Migration

### Phase 5: IR Optimization

**Goal:** Optimize IR before execution.

**Passes:**
- Constant folding
- Dead code elimination
- Common subexpression elimination
- Field fusion (avoid intermediate buffers)

**Reference:** `09-Caching.md`, `10-Schedule-Semantics.md`

---

## Summary

Sprint 2's dual-emit strategy provides:

1. **Non-Breaking Migration** - closures continue to work
2. **IR Validation** - structural correctness checked
3. **Debugger Foundation** - IR structure ready for Phase 4
4. **Incremental Path** - blocks migrate one-by-one

**Next Steps:**
- Phase 4: Build IR runtime + evaluator
- Migrate high-value blocks to semantic IR
- Golden patch full IR equivalence test
- Deprecate closure compilation

**Key Insight:**
We're building the IR **alongside** the closure runtime, not **replacing** it yet. This de-risks the migration and proves the IR architecture before committing to it.

---

## References

- `15-Canonical-Lowering-Pipeline.md` - Full 8-pass pipeline spec
- `16-Block-Lowering.md` - Block compiler contract for IR
- `02-IR-Schema.md` - IR type definitions
- `14-Compiled-IR-Program-Contract.md` - Final IR program structure
- `.agent_planning/phase3-ir-integration/` - Sprint 2 implementation plan
