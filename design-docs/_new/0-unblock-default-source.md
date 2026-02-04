# Deferred Work Inventory
**Date**: 2026-02-03
**Context**: Work items that are known but not currently in progress

---

## High Priority Beads Work Items (Ready)

### [oscilla-animator-v2-3kh6] Add Shape Payload Kind to Type System
**Priority**: P1 (task)
**Status**: Ready (unblocked)

**Description**: Add `SHAPE` as a concrete payload type to the type system.

**Current State**:
- Shape was removed from PayloadType per resolution Q6 (src/core/canonical-types/payloads.ts:32)
- Comment says "shapes are resources, not payloads"
- But RenderInstances2D.shape input exists (src/blocks/render/render-instances-2d.ts:27)
- Currently typed as FLOAT, should be SHAPE

**Related Sub-tasks**:
- **[oscilla-animator-v2-3kh6.1]** Add shape to ConcretePayloadType union (P1)
- **[oscilla-animator-v2-3kh6.2]** Update all shape block definitions to use SHAPE payload (P1)
- **[oscilla-animator-v2-3kh6.4]** Update compiler/runtime to handle shape payload (P1)
- **[oscilla-animator-v2-3kh6.5]** Update DSL serializer/deserializer for shape payload (P1)
- **[oscilla-animator-v2-3kh6.6]** Add tests for shape payload type (P2)

**Key Files**:
- src/core/canonical-types/payloads.ts (add SHAPE to union, line 32)
- src/blocks/render/render-instances-2d.ts:27 (change FLOAT to SHAPE)
- src/blocks/signal/default-source.ts (add SHAPE case to switch)
- src/shapes/* (shape block definitions)

**Architectural Question**:
- How should DefaultSource handle SHAPE payload?
- Should it produce a default shape (circle? rectangle?)
- Or should SHAPE inputs be required (no defaultSource)?

---

### [oscilla-animator-v2-crio] Fix Root Causes of validateConnection Incorrectness
**Priority**: P1 (task)
**Status**: Ready (unblocked)

**Description**: validateConnection function has correctness issues that need root cause fixes.

**Related Sub-tasks**:
- **[oscilla-animator-v2-crio.5]** Add regression tests for validateConnection correctness (P1)
- **[oscilla-animator-v2-crio.3]** Distinguish adapter-required connections in the UI (P2)

**Key Files**:
- Location of validateConnection function (needs to be found)
- UI connection validation code
- Adapter insertion logic (src/compiler/frontend/normalize-adapters.ts)

**Known Issues**:
- Exact nature of incorrectness not specified in beads
- Likely related to type compatibility checking
- May interact with adapter insertion

---

### [oscilla-animator-v2-98sv.7] Add Implicit_source BlockRole and Implicit EdgeRole
**Priority**: P1 (task)
**Status**: Ready (unblocked)

**Description**: Add new role types for implicit sources and edges.

**Context**:
- BlockRole and EdgeRole are enums (src/types/index.ts or src/graph/Patch.ts)
- Need to understand what "implicit_source" means in context
    - It means the edge is hidden in the UI
    - There must be a chip or icon on the ports to indicate its implicit

**Key Files**:
- src/types/index.ts (BlockRole, EdgeRole definitions)
- src/graph/Patch.ts (Block and Edge types)
- Normalization passes that create derived blocks

---

### [oscilla-animator-v2-73lv] Zero-Cardinality Enforcement
**Priority**: P1 (task)
**Status**: Ready (unblocked)

**Description**: Const blocks emit zero cardinality, explicit lift rules.

**Context**:
- Zero cardinality is the "universal donor" (src/core/canonical-types/cardinality.ts:4)
- Const blocks should produce zero cardinality
- Need explicit rules for lifting zero to one/many

**Key Files**:
- src/blocks/signal/const.ts (Const block definition)
- src/core/canonical-types/cardinality.ts (zero cardinality semantics)
- Type inference passes (cardinality unification)

**Relationship to Current Work**:
- This work will be EASIER once cardinality type variables exist
- Zero cardinality unifies with any cardinality (universal donor)
- Type inference can handle zero→one/many lifting automatically

---

### [oscilla-animator-v2-cudk] Extract Shared SignalKernelLibrary
**Priority**: Unknown
**Status**: In Progress

**Description**: Extract shared SignalKernelLibrary from duplicated kernel code.

**Context**:
- Signal processing kernels are duplicated
- Need to identify duplication and extract common library
- Likely in src/runtime/FieldKernels.ts or similar

---

## Pure Lowering Migration (Large Technical Debt)

### Status
- **3 blocks migrated**: Add, HueRainbow, DefaultSource
- **~80 blocks remaining**: Still use imperative slot allocation
- **132 occurrences**: Of `ctx.b.allocSlot()` across codebase

### What Needs to Happen
Each block needs to migrate from:
```typescript
// OLD (impure)
lower: ({ ctx, inputsById }) => {
  const slot = ctx.b.allocSlot(stride);  // ❌ Impure
  const resultId = ctx.b.kernelZip([a, b], fn, outType);
  ctx.b.registerSlotType(slot, outType);  // ❌ Impure
  return {
    outputsById: {
      out: { id: resultId, slot, type: outType, stride },
    },
  };
}
```

To:
```typescript
// NEW (pure)
lower: ({ ctx, inputsById }) => {
  const resultId = ctx.b.kernelZip([a, b], fn, outType);
  return {
    outputsById: {
      out: { id: resultId, slot: undefined, type: outType, stride },
    },
    effects: {
      slotRequests: [{ portId: 'out', type: outType }],
    },
  };
}
```

### Migration Strategy
1. **Start with pure math blocks** (no state, no side effects)
    - Add, Subtract, Multiply, Divide
    - Sin, Cos, Sqrt, etc.
    - All in src/blocks/math/

2. **Then adapter/lens blocks** (also pure)
    - src/blocks/adapter/
    - src/blocks/lens/

3. **Then color blocks** (pure, some use LowerSandbox)
    - src/blocks/color/

4. **Then field operations** (more complex but still pure)
    - src/blocks/field/

5. **Finally stateful blocks** (need stateDecls + stepRequests)
    - src/blocks/signal/ (Lag, Phasor, etc.)
    - These are harder - need two-phase lowering

### Key Files
- **Template**: src/blocks/math/add.ts (lines 41-62) - reference implementation
- **Registry**: src/blocks/registry.ts (loweringPurity field)
- **Orchestrator**: src/compiler/backend/lower-blocks.ts (processes effects)
- **Types**: src/compiler/ir/lowerTypes.ts (LowerEffects definition)

### Benefits of Completion
- Blocks become testable as pure functions
- LowerSandbox can invoke any pure block
- Easier to reason about block composition
- Clearer separation of concerns (blocks vs orchestrator)

---

## DefaultSource Semantic Dispatch

### Current State
DefaultSource uses a fixed policy table based ONLY on payload type:
- float → const(1)
- int → const(0)
- bool → const(false)
- vec2 → const(0, 0)
- vec3 → const(0, 0, 0)
- color → HueRainbow(phaseA)
- event → eventNever

### Problem
Different ports with the SAME payload type need DIFFERENT defaults:
- `Circle.radius` (float) → should default to 1.0 (unit circle)
- `Scale.scale` (float) → should default to 1.0 (identity)
- `Offset.offset` (float) → should default to 0.0 (no offset)
- `GridLayout.spacing` (float) → should default to 10.0 (visible grid)

### Solution: Port-Aware Defaults

**Step 1**: Pass port context via params (normalize-default-sources.ts:143)
```typescript
const effectiveDefault: DefaultSource = portOverride ?? registryDefault ?? {
  blockType: 'DefaultSource',
  output: 'out',
  params: {
    targetBlockType: block.type,      // NEW
    targetPortId: inputId,             // NEW
    targetPortLabel: input.label,      // NEW (optional)
  },
};
```

**Step 2**: DefaultSource dispatches on semantic hints
```typescript
lower: ({ ctx, config }) => {
  const targetPortId = config?.targetPortId as string | undefined;
  const targetBlockType = config?.targetBlockType as string | undefined;

  // Semantic dispatch based on port name
  if (targetPortId === 'radius') return createConstant(1.0, outType);
  if (targetPortId === 'spacing') return createConstant(10.0, outType);
  if (targetPortId === 'offset') return createConstant(0.0, outType);

  // Or block-specific dispatch
  if (targetBlockType === 'Circle' && targetPortId === 'radius') { ... }

  // Fallback to payload-based default
  return defaultForPayload(outType.payload);
}
```

**Step 3**: Define semantic profiles
Could create a semantic database:
```typescript
const SEMANTIC_DEFAULTS: Record<string, ConstValue> = {
  'radius': { kind: 'float', value: 1.0 },
  'scale': { kind: 'float', value: 1.0 },
  'offset': { kind: 'float', value: 0.0 },
  'spacing': { kind: 'float', value: 10.0 },
  'position': { kind: 'vec3', value: [0, 0, 0] },
  // etc.
};
```

### Dependencies
- **MUST WAIT** for cardinality type variables (current task)
- DefaultSource needs to work for both signals and fields first
- Then add semantic dispatch on top

### Key Files
- src/compiler/frontend/normalize-default-sources.ts (pass params)
- src/blocks/signal/default-source.ts (semantic dispatch)
- New file: src/blocks/signal/semantic-defaults.ts (semantic database)

---

## Other Technical Debt

### Circular Dependencies Investigation
**Status**: Work items exist but details unknown
**Context**: Heap exhaustion and circular dependency issues mentioned in planning docs
**Files**:
- .agent_planning/circular-deps/HANDOFF-2026-02-03-heap-exhaustion.md
- .agent_planning/circular-deps/IMPLEMENTATION-SUMMARY-2026-02-03.md
- .agent_planning/circular-deps/WORK-EVALUATION-2026-02-03-213756.md

### Test Isolation Issues
**File**: b590b76 commit mentions "isolate failing CompositeEditorStore integration tests"
**Context**: Some integration tests were failing, needed isolation
**Status**: Partially addressed but may have remaining issues

### Compiler Test Failures
From planning docs (EXPLORE-20260203.md):
- **11 test failures** due to DefaultSource not being registered
- These are likely FIXED now (DefaultSource exists)
- But may have new failures related to cardinality

### Documentation Debt
**Missing or Outdated**:
- How cardinality type variables work (once implemented)
- Pure lowering migration guide for block authors
- Semantic defaults guide (once implemented)
- Type inference algorithm documentation

---

## Work Blocked by Current Task

These items cannot proceed until cardinality type variables are implemented:

### 1. DefaultSource Semantic Dispatch
- Needs working field defaults first
- Then can add port-aware dispatch

### 2. Zero-Cardinality Enforcement
- Easier with cardinality vars
- Type inference can handle zero→one/many lifting

### 3. Pure Lowering Migration (Partial)
- Some blocks may need cardinality-aware logic
- Better to wait until cardinality is truly unified

### 4. Cardinality-Generic Block Testing
- Can't properly test cardinality-generic blocks
- Need both signal and field instantiations to work

---

## Planning Documents to Review

### Active Planning
- .agent_planning/macro-lowering/ (DefaultSource and pure lowering)
- .agent_planning/circular-deps/ (dependency issues)

### Completed Planning (Reference)
- .agent_planning/_completed/compilation-pipeline/
- .agent_planning/_completed/pass7-schedule/
- .agent_planning/_completed/domain-refactor/

### Future Work
- .agent_planning/_future/0-CardinalityGeneric-Block-Type-Spec.md
- .agent_planning/_future/0-PayloadGeneriic-Block-Type-Spec.md

---

## Prioritization Guidance

### Immediate (After Cardinality Vars)
1. Fix DefaultSource semantic dispatch
2. Add SHAPE payload type
3. Fix validateConnection root causes

### Short Term
1. Pure lowering migration (start with math blocks)
2. Zero-cardinality enforcement
3. Add implicit_source/implicit edge roles

### Medium Term
1. Complete pure lowering migration (all blocks)
2. Extract shared SignalKernelLibrary
3. Address circular dependency issues

### Long Term
1. Documentation improvements
2. Test coverage expansion
3. Performance optimization

---

## Success Metrics

### Pure Lowering Migration Complete When:
- ✅ Zero `ctx.b.allocSlot()` calls in block lower functions
- ✅ All blocks use effects-as-data pattern
- ✅ All blocks tagged with correct loweringPurity
- ✅ All tests pass

### DefaultSource Complete When:
- ✅ Works with both signal and field outputs
- ✅ Provides semantically appropriate defaults per port
- ✅ RenderInstances2D with unconnected pos/color/shape works correctly
- ✅ Zero lower function cardinality checks

### Type System Complete When:
- ✅ All axes support type variables (cardinality, temporality, etc.)
- ✅ Type inference unifies all axis variables
- ✅ Zero concrete axis values in block definitions (all vars)
- ✅ All tests pass
