# Implementation Context: adapter-registry

**Sprint**: adapter-registry - Adapter Registry and Graph Normalization
**Generated**: 2026-01-22-120534
**Confidence**: HIGH

## Overview

This sprint implements the adapter system that allows automatic conversion between compatible but unit-mismatched types. Adapters are materialized as derived blocks during graph normalization, so the compiler only sees blocks and edges - no implicit conversions exist.

## Key Files to Create/Modify

### 1. New File: Adapter Block Definitions

**File**: `src/blocks/adapter-blocks.ts` (NEW)

All 10 required adapter blocks live here:

```typescript
import { registerBlock } from './registry';
import { canonicalType, unitPhase01, unitScalar, unitRadians, unitNorm01, unitMs, unitSeconds, unitDegrees } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';

// Phase/Scalar Adapters
registerBlock({
  type: 'Adapter_PhaseToScalar01',
  label: 'Phase → Scalar',
  category: 'adapter',
  description: 'Semantic boundary: phase [0,1) to dimensionless scalar (identity)',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitPhase01()) } },
  outputs: { out: { type: canonicalType('float', unitScalar()) } },
  lower: ({ inputs }) => ({
    outputsById: { out: inputs[0] }, // Identity - no conversion needed
  }),
});

registerBlock({
  type: 'Adapter_ScalarToPhase01',
  label: 'Scalar → Phase',
  category: 'adapter',
  description: 'Wrap scalar to phase [0,1) with cyclic semantics',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitScalar()) } },
  outputs: { out: { type: canonicalType('float', unitPhase01()) } },
  lower: ({ ctx, inputs }) => {
    const wrapped = ctx.b.sigOp(OpCode.wrap01, [inputs[0]], canonicalType('float', unitPhase01()));
    return { outputsById: { out: wrapped } };
  },
});

// Phase/Radians Adapters
registerBlock({
  type: 'Adapter_PhaseToRadians',
  label: 'Phase → Radians',
  category: 'adapter',
  description: 'Convert phase [0,1) to radians [0,2π)',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitPhase01()) } },
  outputs: { out: { type: canonicalType('float', unitRadians()) } },
  lower: ({ ctx, inputs }) => {
    const twoPi = ctx.b.sigConst(6.283185307179586, canonicalType('float', unitScalar()));
    const radians = ctx.b.sigOp(OpCode.mul, [inputs[0], twoPi], canonicalType('float', unitRadians()));
    return { outputsById: { out: radians } };
  },
});

registerBlock({
  type: 'Adapter_RadiansToPhase01',
  label: 'Radians → Phase',
  category: 'adapter',
  description: 'Convert radians to phase [0,1) with wrapping',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitRadians()) } },
  outputs: { out: { type: canonicalType('float', unitPhase01()) } },
  lower: ({ ctx, inputs }) => {
    const twoPi = ctx.b.sigConst(6.283185307179586, canonicalType('float', unitScalar()));
    const divided = ctx.b.sigOp(OpCode.div, [inputs[0], twoPi], canonicalType('float', unitScalar()));
    const wrapped = ctx.b.sigOp(OpCode.wrap01, [divided], canonicalType('float', unitPhase01()));
    return { outputsById: { out: wrapped } };
  },
});

// Degrees/Radians Adapters
registerBlock({
  type: 'Adapter_DegreesToRadians',
  label: 'Degrees → Radians',
  category: 'adapter',
  description: 'Convert degrees to radians',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitDegrees()) } },
  outputs: { out: { type: canonicalType('float', unitRadians()) } },
  lower: ({ ctx, inputs }) => {
    const factor = ctx.b.sigConst(0.017453292519943295, canonicalType('float', unitScalar())); // π/180
    const radians = ctx.b.sigOp(OpCode.mul, [inputs[0], factor], canonicalType('float', unitRadians()));
    return { outputsById: { out: radians } };
  },
});

registerBlock({
  type: 'Adapter_RadiansToDegrees',
  label: 'Radians → Degrees',
  category: 'adapter',
  description: 'Convert radians to degrees',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitRadians()) } },
  outputs: { out: { type: canonicalType('float', unitDegrees()) } },
  lower: ({ ctx, inputs }) => {
    const factor = ctx.b.sigConst(57.29577951308232, canonicalType('float', unitScalar())); // 180/π
    const degrees = ctx.b.sigOp(OpCode.mul, [inputs[0], factor], canonicalType('float', unitDegrees()));
    return { outputsById: { out: degrees } };
  },
});

// Time Adapters
registerBlock({
  type: 'Adapter_MsToSeconds',
  label: 'Ms → Seconds',
  category: 'adapter',
  description: 'Convert milliseconds to seconds',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('int', unitMs()) } },
  outputs: { out: { type: canonicalType('float', unitSeconds()) } },
  lower: ({ ctx, inputs }) => {
    // Convert int:ms to float:ms, then divide by 1000
    const floatMs = ctx.b.sigOp(OpCode.intToFloat, [inputs[0]], canonicalType('float', unitMs()));
    const divisor = ctx.b.sigConst(1000, canonicalType('float', unitScalar()));
    const seconds = ctx.b.sigOp(OpCode.div, [floatMs, divisor], canonicalType('float', unitSeconds()));
    return { outputsById: { out: seconds } };
  },
});

registerBlock({
  type: 'Adapter_SecondsToMs',
  label: 'Seconds → Ms',
  category: 'adapter',
  description: 'Convert seconds to milliseconds (rounded)',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitSeconds()) } },
  outputs: { out: { type: canonicalType('int', unitMs()) } },
  lower: ({ ctx, inputs }) => {
    const multiplier = ctx.b.sigConst(1000, canonicalType('float', unitScalar()));
    const floatMs = ctx.b.sigOp(OpCode.mul, [inputs[0], multiplier], canonicalType('float', unitMs()));
    const intMs = ctx.b.sigOp(OpCode.floor, [floatMs], canonicalType('int', unitMs()));
    return { outputsById: { out: intMs } };
  },
});

// Normalization Adapters
registerBlock({
  type: 'Adapter_ScalarToNorm01Clamp',
  label: 'Scalar → Norm01 (Clamp)',
  category: 'adapter',
  description: 'Clamp scalar to normalized [0,1]',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitScalar()) } },
  outputs: { out: { type: canonicalType('float', unitNorm01()) } },
  lower: ({ ctx, inputs }) => {
    const zero = ctx.b.sigConst(0, canonicalType('float', unitScalar()));
    const one = ctx.b.sigConst(1, canonicalType('float', unitScalar()));
    const clamped = ctx.b.sigOp(OpCode.clamp, [inputs[0], zero, one], canonicalType('float', unitNorm01()));
    return { outputsById: { out: clamped } };
  },
});

registerBlock({
  type: 'Adapter_Norm01ToScalar',
  label: 'Norm01 → Scalar',
  category: 'adapter',
  description: 'Promote normalized [0,1] to scalar (identity)',
  form: 'primitive',
  capability: 'pure',
  cardinality: { cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' },
  inputs: { in: { type: canonicalType('float', unitNorm01()) } },
  outputs: { out: { type: canonicalType('float', unitScalar()) } },
  lower: ({ inputs }) => ({
    outputsById: { out: inputs[0] }, // Identity - no conversion needed
  }),
});
```

Register in blocks/index.ts:
```typescript
import './adapter-blocks';
```

---

### 2. Extend Adapter Registry

**File**: `src/graph/adapters.ts` (MODIFY)

**Current State**: Has basic cardinality adapter (Broadcast), no unit adapters

**Changes**:

```typescript
// Update TypeSignature (line ~39)
export interface TypeSignature {
  readonly payload: PayloadType | 'any';
  readonly unit: Unit | 'any';  // ADD THIS
  readonly cardinality: 'zero' | 'one' | 'many' | 'any';
  readonly temporality: 'continuous' | 'discrete' | 'any';
}

// Update extractSignature (line ~93)
export function extractSignature(type: CanonicalType): TypeSignature {
  const cardinality = getAxisValue(type.extent.cardinality, DEFAULTS_V0.cardinality);
  const temporality = getAxisValue(type.extent.temporality, DEFAULTS_V0.temporality);

  return {
    payload: type.payload,
    unit: type.unit,  // ADD THIS
    cardinality: cardinality.kind,
    temporality: temporality.kind,
  };
}

// Update typesAreCompatible (line ~164)
function typesAreCompatible(from: TypeSignature, to: TypeSignature): boolean {
  return (
    from.payload === to.payload &&
    unitsEqual(from.unit as Unit, to.unit as Unit) &&  // ADD THIS
    from.cardinality === to.cardinality &&
    from.temporality === to.temporality
  );
}

// Add adapter rules AFTER Broadcast rule (line ~84)
// Phase/Scalar
{
  from: { payload: 'float', unit: unitPhase01(), cardinality: 'any', temporality: 'continuous' },
  to: { payload: 'float', unit: unitScalar(), cardinality: 'any', temporality: 'continuous' },
  adapter: {
    blockType: 'Adapter_PhaseToScalar01',
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Phase [0,1) to scalar (semantic boundary)',
  },
},
{
  from: { payload: 'float', unit: unitScalar(), cardinality: 'any', temporality: 'continuous' },
  to: { payload: 'float', unit: unitPhase01(), cardinality: 'any', temporality: 'continuous' },
  adapter: {
    blockType: 'Adapter_ScalarToPhase01',
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Scalar to phase [0,1) with wrapping',
  },
},
// ... add all 10 adapter rules
```

---

### 3. Extend DerivedBlockMeta

**File**: `src/types/index.ts` (MODIFY)

**Current State**: DerivedBlockMeta has defaultSource variant only

**Changes** (find BlockRole definition):

```typescript
export type DerivedBlockMeta =
  | { kind: 'defaultSource'; target: { kind: 'port'; port: { blockId: BlockId; portId: PortId } } }
  | { kind: 'adapter'; edgeId: string; adapterType: string };  // ADD THIS
```

---

### 4. Adapter Anchor Generation

**File**: `src/graph/passes/pass2-adapters.ts` (MODIFY)

**Add function** (around line 50):

```typescript
/**
 * Generate deterministic adapter anchor for stable block IDs.
 * Format: adapter:<edgeId>:<adapterType>
 */
function generateAdapterAnchor(edgeId: string, adapterType: string): string {
  return `adapter:${edgeId}:${adapterType}`;
}

/**
 * Convert adapter anchor to block ID.
 */
function adapterAnchorToBlockId(anchor: string): BlockId {
  return `_${anchor}` as BlockId;
}
```

---

### 5. Extend Pass2 for Adapter Materialization

**File**: `src/graph/passes/pass2-adapters.ts` (MODIFY)

**Current State**: Lines 70-175 analyze and report errors, but don't insert adapters

**Changes**:

```typescript
// In analyzeAdapters function, REPLACE error reporting with adapter insertion:
if (adapterSpec) {
  // Create adapter block with stable ID
  const anchor = generateAdapterAnchor(edge.id, adapterSpec.blockType);
  const adapterId = adapterAnchorToBlockId(anchor);

  const adapterRole: BlockRole = {
    kind: 'derived',
    meta: {
      kind: 'adapter',
      edgeId: edge.id,
      adapterType: adapterSpec.blockType,
    },
  };

  // Get block definition for ports
  const adapterBlockDef = getBlockDefinition(adapterSpec.blockType);
  if (!adapterBlockDef) {
    errors.push({
      kind: 'UnknownAdapterKind',
      edgeId: edge.id,
      adapterType: adapterSpec.blockType,
    });
    continue;
  }

  // Create adapter block
  const adapterBlock: Block = {
    id: adapterId,
    type: adapterSpec.blockType,
    role: adapterRole,
    params: {},
    inputPorts: new Map(Object.keys(adapterBlockDef.inputs).map(id => [id, { id }])),
    outputPorts: new Map(Object.keys(adapterBlockDef.outputs).map(id => [id, { id }])),
  };

  // Create two edges: source→adapter, adapter→target
  const edge1: Edge = {
    id: `${edge.id}_to_adapter`,
    from: edge.from,
    to: { kind: 'port', blockId: adapterId, slotId: adapterSpec.inputPortId },
    enabled: true,
  };

  const edge2: Edge = {
    id: `${edge.id}_from_adapter`,
    from: { kind: 'port', blockId: adapterId, slotId: adapterSpec.outputPortId },
    to: edge.to,
    enabled: true,
  };

  insertions.push({
    block: adapterBlock,
    edgesToAdd: [edge1, edge2],
    edgeToRemove: edge.id,
  });
}
```

Return modified patch with adapter blocks inserted.

---

### 6. Add Adapter Diagnostics

**File**: `src/diagnostics/types.ts` (MODIFY)

Add diagnostic codes:

```typescript
export type DiagnosticCode =
  | ...existing codes...
  | 'UNKNOWN_ADAPTER_KIND'
  | 'ADAPTER_TYPE_MISMATCH'
  | 'ADAPTER_CARDINALITY_MISMATCH';
```

**File**: `src/graph/passes/pass2-adapters.ts` (MODIFY)

Add error types:

```typescript
export type AdapterError =
  | { kind: 'UnknownPort'; blockId: BlockId; portId: string; direction: 'input' | 'output' }
  | { kind: 'NoAdapterFound'; edge: Edge; fromType: string; toType: string }
  | { kind: 'UnknownAdapterKind'; edgeId: string; adapterType: string }  // NEW
  | { kind: 'AdapterTypeMismatch'; edgeId: string; expected: string; actual: string }  // NEW
  | { kind: 'AdapterCardinalityMismatch'; edgeId: string; reason: string };  // NEW
```

---

### 7. Tests

**File**: `src/graph/passes/__tests__/pass2-adapters.test.ts` (NEW or MODIFY)

Key test cases:

```typescript
describe('Adapter Materialization', () => {
  it('should insert PhaseToRadians adapter when connecting phase to radians', () => {
    const patch = createPatch({
      blocks: [
        { id: 'osc', type: 'Oscillator', outputs: { phase: signalTypeSignal('float', unitPhase01()) } },
        { id: 'polar', type: 'FieldPolarLayout', inputs: { angle: signalTypeField('float', 'circles', unitRadians()) } },
      ],
      edges: [
        { id: 'e1', from: { blockId: 'osc', slotId: 'phase' }, to: { blockId: 'polar', slotId: 'angle' } },
      ],
    });

    const result = pass2Adapters(patch);

    expect(result.kind).toBe('ok');
    const normalized = result.patch;

    // Verify adapter block exists
    const adapterBlock = Array.from(normalized.blocks.values()).find(b => b.type === 'Adapter_PhaseToRadians');
    expect(adapterBlock).toBeDefined();
    expect(adapterBlock.role.kind).toBe('derived');
    expect(adapterBlock.role.meta.kind).toBe('adapter');

    // Verify edges split
    const edges = Array.from(normalized.edges.values());
    expect(edges).toHaveLength(2);
    expect(edges[0].to.blockId).toBe(adapterBlock.id);
    expect(edges[1].from.blockId).toBe(adapterBlock.id);
  });

  it('should not insert adapter when types match', () => {
    // phase → phase connection
    // No adapter inserted
  });

  it('should produce stable adapter IDs across normalizations', () => {
    // Run normalization twice
    // Verify adapter block ID is identical
  });
});
```

---

## Spec Compliance Checklist

From 0-Units-and-Adapters.md Part B:

- [ ] §B1: Adapters materialized by normalizer, not compiler
- [ ] §B2: Adapter attachment model (Sprint 3 - editor UI)
- [ ] §B3: Normalization materializes adapters as derived blocks
- [ ] §B3.1: DerivedBlockMeta has adapter variant
- [ ] §B3.2: Stable anchors `adapter:<edgeId>:<adapterType>`
- [ ] §B3.3: Wiring rules: source→adapter→target
- [ ] §B4: Closed adapter registry with 10 required adapters
- [ ] §B4.1: All 10 adapters implemented and registered
- [ ] §B4.2: Disallowed adapters (Phase01ToNorm01) not included
- [ ] §B5: Adapter blocks compile like normal blocks
- [ ] §B6: Adapters are cardinality-preserving
- [ ] §B7: Diagnostics for adapter errors
- [ ] §B8: Determinism and stable IDs

---

## Implementation Order

1. Create adapter-blocks.ts with all 10 blocks (~300 lines)
2. Update adapters.ts TypeSignature and rules (~100 lines)
3. Update types/index.ts DerivedBlockMeta (~2 lines)
4. Add anchor generation to pass2-adapters.ts (~20 lines)
5. Extend pass2-adapters.ts to materialize (~150 lines)
6. Add adapter error types to diagnostics/types.ts (~5 lines)
7. Create pass2-adapters.test.ts (~200 lines)
8. Update adapters.ts documentation (~50 lines)

Total: ~800 lines new/modified across 8 files.
