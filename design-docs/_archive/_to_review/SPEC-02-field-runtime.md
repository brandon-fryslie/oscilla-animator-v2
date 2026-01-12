# Spec: Field Runtime Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Field Runtime
**Priority:** Tier 0-1

---

## Overview

The field runtime has several unimplemented features that cause crashes or silent failures when used.

---

## Backlog Checklist

- [ ] Implement transform chain evaluation in field materializer.
- [ ] Add `fieldReduce` signal expression + evaluator wiring.
- [ ] Support dynamic path fields (map/zip/combine/inputSlot).
- [ ] Enable non-numeric field combine (vec2/vec3/color, layer compositing).
- [ ] Add field-handle cache invalidation on schema changes.
- [ ] Propagate stable domain element IDs for hash/field ops.

---

## Gap 1: Transform Chain Evaluation (CRITICAL)

### Current State

**Location:** `src/editor/runtime/field/Materializer.ts:1145-1179`

```typescript
function fillBufferTransform(handle, destBuffer, env) {
  // TODO: Phase 6 - actually apply transform chain to source field
  // For now, just materialize source and throw (placeholder)
  throw new Error(`fillBufferTransform: transform chain evaluation not implemented`);
}
```

### Impact

- Any field adapter/lens crashes at runtime
- Transform chains in IR are dead code

### Proposed Solution

```typescript
interface TransformChainIR {
  steps: TransformStepIR[];
}

type TransformStepIR =
  | { kind: 'cast'; from: TypeDesc; to: TypeDesc }
  | { kind: 'map'; fn: PureFnRef }
  | { kind: 'scaleBias'; scale: number; bias: number }
  | { kind: 'normalize'; min: number; max: number }
  | { kind: 'quantize'; levels: number }
  | { kind: 'ease'; fn: EaseFn }
  | { kind: 'slew'; rate: number };

function fillBufferTransform(handle: FieldHandleTransform, destBuffer: Float32Array, env: FieldEnv) {
  // 1. Materialize source field
  const srcBuffer = materializeField(handle.src, env);

  // 2. Get transform chain from IR
  const chain = env.transformTable[handle.chain];

  // 3. Apply each step in sequence
  let current = srcBuffer;
  for (const step of chain.steps) {
    current = applyTransformStep(step, current, env);
  }

  // 4. Copy to destination
  destBuffer.set(current);
}

function applyTransformStep(step: TransformStepIR, buffer: Float32Array, env: FieldEnv): Float32Array {
  switch (step.kind) {
    case 'scaleBias':
      return buffer.map(v => v * step.scale + step.bias);
    case 'normalize':
      const range = step.max - step.min;
      return buffer.map(v => (v - step.min) / range);
    case 'quantize':
      return buffer.map(v => Math.floor(v * step.levels) / step.levels);
    case 'ease':
      return buffer.map(v => applyEase(step.fn, v));
    case 'slew':
      return applySlewRate(buffer, step.rate, env);
    case 'map':
      return buffer.map(v => evalKernel(step.fn, v));
    case 'cast':
      return castBuffer(buffer, step.from, step.to);
  }
}
```

### Files to Modify

1. `src/editor/runtime/field/Materializer.ts` - Implement `fillBufferTransform`
2. `src/editor/compiler/ir/transforms.ts` - Ensure TransformChainIR is complete
3. Add tests: `src/editor/runtime/field/__tests__/TransformChain.test.ts`

### Complexity

Medium-High - Each transform step type needs implementation.

---

## Gap 2: Field Reduce Placeholder (HIGH)

### Current State

**Location:** `src/editor/compiler/ir/IRBuilderImpl.ts:537-557`

```typescript
reduceFieldToSig(_field: FieldExprId, fn: ReduceFn): SigExprId {
  // Placeholder - field input ignored!
  const id = this.allocSigExprId();
  this.sigExprs.push({
    kind: "map",
    type: fn.outputType,
    src: 0 as SigExprId,  // WRONG: Should reference field
    fn: { kind: "kernel", kernelId: `reduce_${fn.reducerId}` },
  });
  return id;
}
```

### Impact

- `FieldReduce` block produces wrong output
- Any field-to-signal reduction broken

### Proposed Solution

Add a new SignalExpr node type for reduction:

```typescript
// In signalExpr.ts
interface SignalExprFieldReduce {
  kind: "fieldReduce";
  type: TypeDesc;
  field: FieldExprId;
  reducer: ReducerKind;
  initialValue?: number;
}

type ReducerKind = 'sum' | 'average' | 'min' | 'max' | 'count' | 'first' | 'last';

// In IRBuilderImpl.ts
reduceFieldToSig(field: FieldExprId, fn: ReduceFn): SigExprId {
  const id = this.allocSigExprId();
  this.sigExprs.push({
    kind: "fieldReduce",
    type: fn.outputType,
    field: field,  // Actually use the field!
    reducer: fn.reducerId as ReducerKind,
    initialValue: fn.initialValue,
  });
  return id;
}

// In SigEvaluator.ts
case 'fieldReduce': {
  const fieldData = materializeField(node.field, env.fieldEnv);
  return reduceArray(fieldData, node.reducer, node.initialValue);
}

function reduceArray(data: Float32Array, reducer: ReducerKind, initial?: number): number {
  switch (reducer) {
    case 'sum': return data.reduce((a, b) => a + b, initial ?? 0);
    case 'average': return data.reduce((a, b) => a + b, 0) / data.length;
    case 'min': return Math.min(...data);
    case 'max': return Math.max(...data);
    case 'count': return data.length;
    case 'first': return data[0] ?? initial ?? 0;
    case 'last': return data[data.length - 1] ?? initial ?? 0;
  }
}
```

### Files to Modify

1. `src/editor/compiler/ir/signalExpr.ts` - Add `SignalExprFieldReduce`
2. `src/editor/compiler/ir/IRBuilderImpl.ts` - Fix `reduceFieldToSig`
3. `src/editor/runtime/signal-expr/SigEvaluator.ts` - Add reduce evaluator
4. Add tests

### Complexity

Medium - New node type with simple evaluation.

---

## Gap 3: Path Field Evaluation (HIGH)

### Current State

**Location:** `src/editor/runtime/executor/steps/executeMaterializePath.ts:122-146`

```typescript
if (fieldNode.kind !== 'const') {
  throw new Error(`Path field must be const, got: ${fieldNode.kind}`);
}
```

### Impact

- Dynamic path fields crash
- Path animations don't work

### Proposed Solution

```typescript
function evaluatePathField(
  fieldNode: FieldExprIR,
  env: FieldEnv
): PathData[] {
  switch (fieldNode.kind) {
    case 'const':
      return env.constPool[fieldNode.constId] as PathData[];

    case 'map':
      const srcPaths = evaluatePathField(fieldNode.src, env);
      return srcPaths.map(path => applyPathTransform(path, fieldNode.fn));

    case 'zip':
      const aPaths = evaluatePathField(fieldNode.a, env);
      const bPaths = evaluatePathField(fieldNode.b, env);
      return zipPaths(aPaths, bPaths, fieldNode.fn);

    case 'busCombine':
      const termPaths = fieldNode.terms.map(t => evaluatePathField(t, env));
      return combinePaths(termPaths, fieldNode.combine);

    case 'inputSlot':
      return env.slotHandles.read(fieldNode.slot) as PathData[];

    default:
      throw new Error(`Unsupported path field kind: ${fieldNode.kind}`);
  }
}
```

### Path Transform Operations

```typescript
type PathTransformFn =
  | { kind: 'translate'; dx: number; dy: number }
  | { kind: 'scale'; sx: number; sy: number; cx?: number; cy?: number }
  | { kind: 'rotate'; angle: number; cx?: number; cy?: number }
  | { kind: 'reverse' }
  | { kind: 'simplify'; tolerance: number };

function applyPathTransform(path: PathData, fn: PathTransformFn): PathData {
  // Transform each point in the path
}
```

### Complexity

High - Path data structures are complex.

---

## Gap 4: Non-Numeric Field Combine (HIGH)

### Current State

**Location:** `src/editor/runtime/field/Materializer.ts:1208-1247`

Only `number` domain is supported for field combine operations.

### Impact

- Color field buses don't combine properly
- Vec2/vec3 field combination fails

### Proposed Solution

```typescript
function combineFields(
  terms: FieldHandle[],
  mode: CombineMode,
  type: TypeDesc,
  env: FieldEnv
): Float32Array {
  const n = env.domainCount;

  switch (type.domain) {
    case 'number':
      return combineNumberFields(terms, mode, n, env);

    case 'vec2':
      return combineVec2Fields(terms, mode, n, env);

    case 'vec3':
      return combineVec3Fields(terms, mode, n, env);

    case 'color':
      return combineColorFields(terms, mode, n, env);

    default:
      throw new Error(`Unsupported domain for combine: ${type.domain}`);
  }
}

function combineVec2Fields(
  terms: FieldHandle[],
  mode: CombineMode,
  n: number,
  env: FieldEnv
): Float32Array {
  // Vec2 is 2 floats per element
  const result = new Float32Array(n * 2);
  const termBuffers = terms.map(t => materializeField(t, env));

  for (let i = 0; i < n; i++) {
    const offset = i * 2;
    // Combine x and y components separately
    result[offset] = combineScalars(termBuffers.map(b => b[offset]), mode);
    result[offset + 1] = combineScalars(termBuffers.map(b => b[offset + 1]), mode);
  }

  return result;
}

function combineColorFields(
  terms: FieldHandle[],
  mode: CombineMode,
  n: number,
  env: FieldEnv
): Float32Array {
  // Color is 4 floats (RGBA) per element
  const result = new Float32Array(n * 4);
  const termBuffers = terms.map(t => materializeField(t, env));

  for (let i = 0; i < n; i++) {
    const offset = i * 4;
    // Combine RGBA components
    // Note: 'layer' mode for colors = alpha compositing
    if (mode === 'layer') {
      result.set(alphaComposite(termBuffers, offset), offset);
    } else {
      for (let c = 0; c < 4; c++) {
        result[offset + c] = combineScalars(termBuffers.map(b => b[offset + c]), mode);
      }
    }
  }

  return result;
}
```

### Complexity

Medium - Pattern is clear, just domain-specific logic.

---

## Gap 5: Field Handle Cache Invalidation (MEDIUM)

### Current State

**Location:** `src/editor/runtime/field/FieldHandle.ts:95-103`

Cache uses only `frameId` for invalidation. After hot-swap, stale handles may be returned.

### Proposed Solution

```typescript
interface FieldHandleCache {
  handles: FieldHandle[];
  stamp: number[];
  frameId: number;
  schemaVersion: number;  // NEW: Tracks IR schema version
}

function evalFieldHandle(
  fieldId: FieldExprId,
  env: FieldEnv,
  nodes: FieldExprIR[]
): FieldHandle {
  // Check schema version first
  if (env.cache.schemaVersion !== env.schemaVersion) {
    // Schema changed - invalidate entire cache
    env.cache.handles = [];
    env.cache.stamp = [];
    env.cache.schemaVersion = env.schemaVersion;
  }

  // Then check frame stamp
  if (env.cache.stamp[fieldId] === env.cache.frameId) {
    return env.cache.handles[fieldId];
  }

  // ... rest of evaluation
}
```

### Complexity

Low - Simple version check.

---

## Gap 6: Domain Element ID Propagation (MEDIUM)

### Current State

**Location:** `src/editor/runtime/field/Materializer.ts:283`

```typescript
const elementId = env.domainElements?.[index] ?? String(index);
```

`domainElements` is never populated, so `hash01ById` always uses unstable index-based IDs.

### Proposed Solution

```typescript
// In domain creation (DomainN, GridDomain, SVGSampleDomain blocks)
interface DomainHandle {
  count: number;
  elements: DomainElement[];
}

interface DomainElement {
  id: string;        // Stable identifier
  index: number;     // Current index
  properties?: Record<string, unknown>;  // Optional metadata
}

// In executor setup
function setupFieldEnv(programIR: CompiledProgramIR): FieldEnv {
  const domainHandle = programIR.domains[0];  // Primary domain
  return {
    // ...
    domainElements: domainHandle.elements.map(e => e.id),
    domainCount: domainHandle.count,
  };
}

// In block lowering
const lowerDomainN: BlockLowerFn = ({ ctx, inputs, config }) => {
  const n = (config as { n: number }).n;
  const elements = Array.from({ length: n }, (_, i) => ({
    id: `element-${i}`,  // Stable ID
    index: i,
  }));

  const domainSlot = ctx.b.registerDomain({ count: n, elements });
  return { outputs: [{ k: 'special', tag: 'domain', id: domainSlot }] };
};
```

### Complexity

Medium - Requires plumbing through domain creation paths.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| Transform chains | CRITICAL | Medium-High | Adapters, lenses |
| Field reduce | HIGH | Medium | Field-to-signal aggregation |
| Path fields | HIGH | High | Path animations |
| Non-numeric combine | HIGH | Medium | Color/vec2 buses |
| Cache invalidation | MEDIUM | Low | Hot-swap stability |
| Domain element IDs | MEDIUM | Medium | Stable hash01ById |

**Recommended order:** Transform chains → Field reduce → Non-numeric combine → Cache invalidation → Domain IDs → Path fields
