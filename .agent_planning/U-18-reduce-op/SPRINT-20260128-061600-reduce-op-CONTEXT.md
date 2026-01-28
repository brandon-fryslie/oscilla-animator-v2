# Implementation Context: reduce-op
Generated: 2026-01-28-061600  
Plan: SPRINT-20260128-061600-reduce-op-PLAN.md  
Goal: Provide exact file locations, line numbers, and code patterns for implementing ReduceOp

**Mission**: An agent with ONLY this file could implement the plan.

---

## File Locations and Modification Points

### 1. IR Types (P0)
**File**: `src/compiler/ir/types.ts`

**Location 1**: Add to SigExpr union (lines 84-93)
```typescript
// BEFORE:
export type SigExpr =
  | SigExprConst
  | SigExprSlot
  | SigExprTime
  | SigExprExternal
  | SigExprMap
  | SigExprZip
  | SigExprStateRead
  | SigExprShapeRef
  | SigExprEventRead;

// AFTER (add one line):
export type SigExpr =
  | SigExprConst
  | SigExprSlot
  | SigExprTime
  | SigExprExternal
  | SigExprMap
  | SigExprZip
  | SigExprStateRead
  | SigExprShapeRef
  | SigExprReduceField        // ← ADD THIS
  | SigExprEventRead;
```

**Location 2**: Add interface definition (after line 165, before SigExprEventRead)
```typescript
// INSERT at line ~166 (after SigExprShapeRef, before SigExprEventRead):
/**
 * Reduce field to scalar signal expression.
 * Aggregates all elements of a field using a reduction operation.
 * 
 * Semantics: Componentwise reduction (e.g., vec2 sum: (Σx, Σy))
 * Empty field behavior: Returns 0 for numeric types
 * 
 * Spec: 04-compilation.md:394, 409
 */
export interface SigExprReduceField {
  readonly kind: 'reduce_field';
  readonly field: FieldExprId;           // Input field to aggregate
  readonly op: 'min' | 'max' | 'sum' | 'avg';  // Reduction operation
  readonly type: CanonicalType;             // Output signal type (cardinality=one, same payload)
}
```

**Pattern to follow**: See `SigExprShapeRef` (lines 147-154) for how to reference a FieldExprId in a SigExpr.

---

### 2. IRBuilder Interface (P0)
**File**: `src/compiler/ir/IRBuilder.ts`

**Location**: After `sigShapeRef()` method (~line 85)
```typescript
// INSERT at line ~86 (after sigShapeRef method declaration):

/**
 * Create a reduce field signal expression.
 * Aggregates a field into a scalar signal using the specified reduction operation.
 * 
 * @param field - Field expression to reduce
 * @param op - Reduction operation: 'min' | 'max' | 'sum' | 'avg'
 * @param type - Signal type (output, cardinality=one, payload matches input field)
 * @returns SigExprId for the reduce expression
 * 
 * Example:
 *   const sumSig = b.ReduceField(fieldId, 'sum', canonicalType('float'));
 */
ReduceField(
  field: FieldExprId,
  op: 'min' | 'max' | 'sum' | 'avg',
  type: CanonicalType
): SigExprId;
```

**Pattern to follow**: See `sigShapeRef()` at line 79-84, and `Broadcast()` at line 131 (the dual operation).

---

### 3. IRBuilder Implementation (P0)
**File**: `src/compiler/ir/IRBuilderImpl.ts`

**Location**: After `Broadcast()` method (~line 290)
```typescript
// INSERT at line ~291 (right after Broadcast implementation):

ReduceField(field: FieldExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): SigExprId {
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({ kind: 'reduce_field', field, op, type });
  return id;
}
```

**Pattern to follow**: Exact mirror of `Broadcast()` at lines 286-290:
```typescript
Broadcast(signal: SigExprId, type: CanonicalType): FieldExprId {
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push({ kind: 'broadcast', signal, type });
  return id;
}
```

**Key difference**: 
- Broadcast: Returns `FieldExprId`, pushes to `fieldExprs`
- ReduceField: Returns `SigExprId`, pushes to `sigExprs`

---

### 4. Block Registration (P1)
**File**: `src/blocks/field-blocks.ts`

**Location**: After Broadcast block (~line 91)
```typescript
// INSERT at line ~92 (after Broadcast block closing brace and semicolon):

// =============================================================================
// Reduce (Payload-Generic)
// =============================================================================

/**
 * Payload-Generic field reduction block.
 * 
 * Reduces a field to a scalar signal using an aggregation operation.
 * Supports componentwise reduction for structured types (e.g., vec2).
 * 
 * Operations:
 * - sum: Σ(field[i]) per component
 * - avg: Σ(field[i]) / count per component
 * - min: min(field) per component
 * - max: max(field) per component
 * 
 * Empty field behavior: Returns 0
 * NaN behavior: Propagates NaN if any element is NaN
 * 
 * Spec: 02-block-system.md:436, 04-compilation.md:394
 */
registerBlock({
  type: 'Reduce',
  label: 'Reduce',
  category: 'field',
  description: 'Reduce a field to a scalar using an aggregation operation',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'transform',  // many → one
    laneCoupling: 'laneGlobal',    // All elements contribute to single result
  },
  payload: {
    allowedPayloads: {
      field: ALL_CONCRETE_PAYLOADS,
      signal: ALL_CONCRETE_PAYLOADS,
    },
    combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
      inputs: [p] as PayloadType[],
      output: p,
    })),
    semantics: 'typeSpecific',
  },
  parameters: {
    op: {
      label: 'Operation',
      type: 'enum',
      options: ['sum', 'avg', 'min', 'max'],
      default: 'sum',
    },
  },
  inputs: {
    field: { 
      label: 'Field', 
      type: signalTypeField(payloadVar('reduce_payload'), 'default', unitVar('reduce_in'))
    },
  },
  outputs: {
    signal: { 
      label: 'Result', 
      type: canonicalType(payloadVar('reduce_payload'), unitVar('reduce_in'))
    },
  },
  lower: ({ ctx, inputsById, params }) => {
    // Get resolved output type from pass1
    const outType = ctx.outTypes[0];
    if (!outType) {
      throw new Error(`Reduce block missing resolved output type from pass1`);
    }
    const payloadType = outType.payload as PayloadType;

    // Get field input
    const fieldInput = inputsById.field;
    if (!fieldInput || fieldInput.k !== 'field') {
      throw new Error('Reduce field input must be a field');
    }

    // Get operation parameter
    const op = params.op as 'min' | 'max' | 'sum' | 'avg';
    if (!['min', 'max', 'sum', 'avg'].includes(op)) {
      throw new Error(`Invalid reduce operation: ${op}`);
    }

    // Create reduce signal expression
    const sigId = ctx.b.ReduceField(
      fieldInput.id as FieldExprId,
      op,
      canonicalType(payloadType)  // Output has same payload but cardinality=one
    );
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        signal: { k: 'sig', id: sigId, slot, type: outType },
      },
      // Reduce is instance-agnostic (like Broadcast)
      instanceContext: undefined,
    };
  },
});
```

**Pattern to follow**: 
- Broadcast block at lines 33-90 (the inverse operation)
- Use same payload-generic pattern
- Use same error checking pattern for missing types

**Imports needed** (already at top of file):
- `registerBlock`, `ALL_CONCRETE_PAYLOADS` from './registry'
- `canonicalType`, `signalTypeField`, `payloadVar`, `unitVar` from '../core/canonical-types'
- `SigExprId`, `FieldExprId` from '../compiler/ir/Indices'

---

### 5. Signal Evaluation (P1)
**File**: `src/runtime/SignalEvaluator.ts`

**Location 1**: Import materialize function (add to imports at top)
```typescript
// ADD to imports around line 64:
import { materialize } from './Materializer';
```

**Location 2**: Add case handler in `evaluateSigExpr()` switch (after line 200, before `eventRead` case at line 201)
```typescript
// INSERT at line ~200 (after shapeRef case, before eventRead case):

case 'reduce_field': {
  // Get field buffer by materializing the field expression
  // We need access to the field expr to materialize it, and instance context
  const fieldExpr = fields[expr.field as number];
  if (!fieldExpr) {
    throw new Error(`Field expression ${expr.field} not found`);
  }

  // Determine instance from field expr (if it has one)
  // For now, we'll need to infer this or require it in the expr
  // TODO: This may need refactoring - field evaluation needs instance context
  
  // Alternative: Add a Step for reduce execution instead of direct evaluation
  // For now, return 0 as placeholder and implement via Step in executor
  // (See P1 acceptance criteria - this needs research)
  return 0;
}
```

**IMPORTANT**: This case reveals a design question:
- Should reduce be evaluated during signal evaluation (requires materializing field)?
- OR should it be deferred to a Step (like StepReduceFieldToScalar in spec)?

**Research needed**: 
1. Check how SigExprShapeRef is handled (it also references a field)
2. Determine if we need a Step for reduce, or if we can materialize inline

**Alternative implementation** (if materialize inline is feasible):
```typescript
case 'reduce_field': {
  // Get stride from output type
  const stride = strideOf(expr.type.payload);
  
  // Materialize field to get buffer
  // NOTE: This requires instance context which we may not have here
  // May need to be implemented as a Step instead
  const instanceId = /* TODO: resolve instance */;
  const buffer = materialize(expr.field, instanceId, fields, signals, instances, state, pool);
  
  // Perform reduction
  return reduceBuffer(buffer, expr.op, stride);
}

// Helper function (add after evaluateSigExpr):
function reduceBuffer(
  buffer: Float32Array,
  op: 'min' | 'max' | 'sum' | 'avg',
  stride: number
): number {
  const count = buffer.length / stride;
  
  if (count === 0) {
    return 0; // Empty field returns 0
  }
  
  // For now, return first component only (stride-aware reduction TODO)
  // Full implementation should handle multi-component (vec2, color)
  let result: number;
  
  switch (op) {
    case 'sum': {
      result = 0;
      for (let i = 0; i < count; i++) {
        result += buffer[i * stride];
      }
      break;
    }
    case 'avg': {
      result = 0;
      for (let i = 0; i < count; i++) {
        result += buffer[i * stride];
      }
      result = result / count;
      break;
    }
    case 'min': {
      result = buffer[0];
      for (let i = 1; i < count; i++) {
        const val = buffer[i * stride];
        if (val < result) result = val;
      }
      break;
    }
    case 'max': {
      result = buffer[0];
      for (let i = 1; i < count; i++) {
        const val = buffer[i * stride];
        if (val > result) result = val;
      }
      break;
    }
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown reduce op: ${String(_exhaustive)}`);
    }
  }
  
  return result;
}
```

**Pattern to follow**:
- See how `case 'shapeRef':` is handled at line 194-199 (returns 0, actual work done elsewhere)
- This suggests reduce might also need Step-based execution

---

### 6. Componentwise Reduction (P1)
**File**: `src/runtime/SignalEvaluator.ts` (or separate helper file)

**Componentwise pattern** (from evaluation §8):
```typescript
/**
 * Reduce a field buffer with componentwise semantics.
 * 
 * For structured types (vec2, vec3, color), each component is reduced independently:
 * - vec2 sum: [vec2(1,2), vec2(3,4)] → vec2(4, 6)
 * - NOT magnitude: [vec2(1,2)] ≠ scalar(sqrt(5))
 * 
 * @param buffer - Float32Array containing field data
 * @param op - Reduction operation
 * @param stride - Components per element (1=float, 2=vec2, 3=vec3, 4=color)
 * @returns Float32Array with stride elements (one per component)
 */
function reduceFieldComponentwise(
  buffer: Float32Array,
  op: 'min' | 'max' | 'sum' | 'avg',
  stride: number
): Float32Array {
  const count = buffer.length / stride;
  const result = new Float32Array(stride);
  
  if (count === 0) {
    // Empty field: return zeros
    return result;
  }
  
  // Initialize based on operation
  for (let comp = 0; comp < stride; comp++) {
    switch (op) {
      case 'sum':
      case 'avg':
        result[comp] = 0;
        break;
      case 'min':
      case 'max':
        result[comp] = buffer[comp]; // First element
        break;
    }
  }
  
  // Reduce each component independently
  for (let comp = 0; comp < stride; comp++) {
    switch (op) {
      case 'sum':
      case 'avg': {
        let sum = 0;
        for (let i = 0; i < count; i++) {
          sum += buffer[i * stride + comp];
        }
        result[comp] = (op === 'avg') ? sum / count : sum;
        break;
      }
      case 'min': {
        let min = buffer[comp];
        for (let i = 1; i < count; i++) {
          const val = buffer[i * stride + comp];
          if (val < min) min = val;
        }
        result[comp] = min;
        break;
      }
      case 'max': {
        let max = buffer[comp];
        for (let i = 1; i < count; i++) {
          const val = buffer[i * stride + comp];
          if (val > max) max = val;
        }
        result[comp] = max;
        break;
      }
    }
  }
  
  return result;
}
```

**Usage**: Store result components in consecutive slots based on stride.

---

### 7. Test File (P2)
**File**: `src/runtime/__tests__/reduce-op.test.ts` (NEW FILE)

**Template**:
```typescript
/**
 * ReduceOp Tests
 * 
 * Tests field→scalar reduction operations (sum, avg, min, max)
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../ScheduleExecutor';
import { createRuntimeState } from '../RuntimeState';
import { getTestArena } from './test-arena-helper';

describe('ReduceOp', () => {
  describe('sum operation', () => {
    it('sums scalar field values', () => {
      // TODO: Build patch with Array → Field → Reduce(sum)
      // Verify result is sum of all elements
    });

    it('sums vec2 componentwise', () => {
      // TODO: Build patch with vec2 field
      // Verify: [vec2(1,2), vec2(3,4)] → vec2(4, 6)
    });

    it('returns 0 for empty field', () => {
      // TODO: Build patch with count=0 array
      // Verify: sum([]) === 0
    });

    it('propagates NaN', () => {
      // TODO: Build patch with NaN in field
      // Verify: sum([1, NaN, 3]) === NaN
    });
  });

  describe('avg operation', () => {
    it('averages scalar field values', () => {
      // TODO: Verify avg([2, 4, 6]) === 4
    });

    it('returns 0 for empty field (not NaN)', () => {
      // TODO: Verify avg([]) === 0, not NaN
    });
  });

  describe('min operation', () => {
    it('finds minimum value', () => {
      // TODO: Verify min([3, 1, 2]) === 1
    });

    it('returns 0 for empty field', () => {
      // TODO: Verify min([]) === 0, not Infinity
    });
  });

  describe('max operation', () => {
    it('finds maximum value', () => {
      // TODO: Verify max([3, 1, 2]) === 3
    });

    it('returns 0 for empty field', () => {
      // TODO: Verify max([]) === 0, not -Infinity
    });
  });

  describe('performance', () => {
    it('processes 10k elements in <1ms', () => {
      // TODO: Build patch with 10k element array
      // Measure execution time
      // Assert < 1ms
    });
  });
});
```

**Pattern to follow**: See `src/runtime/__tests__/integration.test.ts` lines 1-100 for patch building and execution patterns.

---

## Data Structures Referenced

### CanonicalType (from canonical-types)
```typescript
interface CanonicalType {
  world: 'signal' | 'field' | 'event';
  cardinality: 'one' | 'many';
  payload: PayloadType;
  unit?: string;
}
```

### PayloadType
```typescript
type PayloadType = 'float' | 'vec2' | 'vec3' | 'color' | 'int' | 'bool' | 'phase' | 'unit' | 'SHAPE';
```

### Stride values
```typescript
// From strideOf() function:
float → 1
vec2 → 2
vec3 → 3
color → 4
int → 1
bool → 1
phase → 1
```

---

## Import Paths

```typescript
// IR types
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';
import type { CanonicalType } from '../core/canonical-types';
import { canonicalType, signalTypeField, strideOf, payloadVar, unitVar } from '../core/canonical-types';

// Block registration
import { registerBlock, ALL_CONCRETE_PAYLOADS, type PayloadType } from './registry';

// Runtime
import { evaluateSignal } from './SignalEvaluator';
import { materialize } from './Materializer';
import type { RuntimeState } from './RuntimeState';

// Testing
import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../ScheduleExecutor';
import { createRuntimeState } from '../RuntimeState';
import { getTestArena } from './test-arena-helper';
```

---

## Adjacent Code Patterns

### Broadcast (the dual operation)
**Location**: `src/blocks/field-blocks.ts:33-90`
```typescript
// Broadcast: Signal → Field
registerBlock({
  type: 'Broadcast',
  inputs: { signal: ... },
  outputs: { field: ... },
  lower: ({ ctx, inputsById }) => {
    const fieldId = ctx.b.Broadcast(signalValue.id, ...);
    return { outputsById: { field: { k: 'field', id: fieldId, ... } } };
  },
});

// Reduce: Field → Signal (inverse)
registerBlock({
  type: 'Reduce',
  inputs: { field: ... },
  outputs: { signal: ... },
  lower: ({ ctx, inputsById, params }) => {
    const sigId = ctx.b.ReduceField(fieldInput.id, params.op, ...);
    return { outputsById: { signal: { k: 'sig', id: sigId, ... } } };
  },
});
```

### SigExprShapeRef (SigExpr with FieldExprId)
**Location**: `src/compiler/ir/types.ts:147-154`
```typescript
export interface SigExprShapeRef {
  readonly kind: 'shapeRef';
  readonly topologyId: TopologyId;
  readonly paramSignals: readonly SigExprId[];
  readonly controlPointField?: { readonly id: FieldExprId; readonly stride: number };
  readonly type: CanonicalType;
}
// ↑ This shows SigExprs CAN reference FieldExprIds
```

---

## Critical Decisions from Evaluation

1. **Reduce is a SigExpr** (not just a Step)
   - Precedent: `SigExprShapeRef` has optional `FieldExprId`
   - Enables composition with other signal expressions

2. **Componentwise semantics** (registry.ts:196)
   - vec2 sum: [vec2(1,2), vec2(3,4)] → vec2(4, 6)
   - NOT magnitude: [vec2(1,2)] ≠ scalar(sqrt(5))

3. **Empty field returns 0** (acceptable default)
   - sum([]) = 0
   - avg([]) = 0 (not NaN from 0/0)
   - min([]) = 0 (not Infinity)
   - max([]) = 0 (not -Infinity)

4. **NaN propagation**: Follow IEEE 754 (fail-fast)
   - sum([1, NaN, 3]) = NaN

---

## Known Unknowns (Research Items)

1. **Multi-component signal storage**: How do we return vec2 from a signal?
   - Check: SigExprShapeRef handling
   - Likely: Store in consecutive slots based on stride

2. **Materializer access from SignalEvaluator**: Safe to import?
   - Check: Existing imports between these files
   - Known: Materializer already imports SignalEvaluator (line 64)

3. **Should reduce be a Step instead of direct evaluation?**
   - Check: How shapeRef is handled (returns 0, work done elsewhere)
   - Likely: Yes, emit StepReduceFieldToScalar in executor

---

## End of Context Document
All necessary information for implementation is above. No external documentation needed.
