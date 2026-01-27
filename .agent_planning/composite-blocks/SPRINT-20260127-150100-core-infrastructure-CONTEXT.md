# Implementation Context: Core Infrastructure Sprint
Generated: 2026-01-27T15:01:00Z

## Key Files to Modify

### `src/blocks/registry.ts`
**Current state**: Defines `BlockForm = 'primitive' | 'macro'` and `BlockDef` interface.
**Changes needed**:
1. Add 'composite' to BlockForm
2. Add CompositeBlockDef interface (or create separate file)
3. Update `registerBlock()` to handle composites
4. Add `isComposite()` type guard

### `src/graph/passes/index.ts`
**Current state**: Exports pass1-4 in order.
**Changes needed**:
1. Add pass0-composite-expansion import
2. Update pipeline to run pass0 first

### `src/graph/Patch.ts`
**Current state**: Defines Block, Edge, and Patch types.
**Changes needed**: Possibly none - expansion creates standard blocks/edges.

### `src/compiler/passes-v2/pass6-block-lowering.ts`
**Current state**: Generates state keys using blockId + primitiveKind.
**Changes needed**:
1. Accept composite path in LowerCtx
2. Include composite path in state key generation

## New Files to Create

### `src/blocks/composite-types.ts`
```typescript
import type { BlockDef, InputDef, OutputDef } from './registry';
import type { Slot } from '../types';

/** Internal block ID within a composite (not globally unique) */
export type InternalBlockId = string & { readonly __brand: 'InternalBlockId' };

/** Definition of a block inside a composite */
export interface InternalBlockDef {
  readonly type: string;  // References a registered block type
  readonly params?: Readonly<Record<string, unknown>>;
  readonly displayName?: string;
}

/** Internal edge connecting two blocks inside a composite */
export interface InternalEdge {
  readonly fromBlock: InternalBlockId;
  readonly fromPort: string;
  readonly toBlock: InternalBlockId;
  readonly toPort: string;
}

/** Exposed input port mapping */
export interface ExposedInputPort {
  readonly externalId: string;
  readonly externalLabel?: string;
  readonly internalBlockId: InternalBlockId;
  readonly internalPortId: string;
  // Inherit type from internal port, or override?
  readonly type?: SignalType;
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;
}

/** Exposed output port mapping */
export interface ExposedOutputPort {
  readonly externalId: string;
  readonly externalLabel?: string;
  readonly internalBlockId: InternalBlockId;
  readonly internalPortId: string;
}

/** Full composite block definition */
export interface CompositeBlockDef extends Omit<BlockDef, 'form' | 'lower' | 'inputs' | 'outputs'> {
  readonly form: 'composite';

  // Internal graph
  readonly internalBlocks: ReadonlyMap<InternalBlockId, InternalBlockDef>;
  readonly internalEdges: readonly InternalEdge[];

  // Port exposure (these become the block's inputs/outputs)
  readonly exposedInputs: readonly ExposedInputPort[];
  readonly exposedOutputs: readonly ExposedOutputPort[];

  // Computed from exposed ports (for compatibility with BlockDef consumers)
  readonly inputs: Record<string, InputDef>;
  readonly outputs: Record<string, OutputDef>;
}
```

### `src/graph/passes/pass0-composite-expansion.ts`
```typescript
import type { Patch, Block, Edge } from '../Patch';
import type { CompositeBlockDef } from '../../blocks/composite-types';
import { getBlockDef, isComposite } from '../../blocks/registry';
import { PatchBuilder } from '../Patch';

export interface ExpansionResult {
  readonly patch: Patch;
  readonly expansionMap: ReadonlyMap<string, CompositeExpansionInfo>;
}

export interface CompositeExpansionInfo {
  readonly compositeBlockId: string;
  readonly compositeDefId: string;
  readonly expandedBlockIds: readonly string[];
}

export function pass0CompositeExpansion(patch: Patch): ExpansionResult {
  // Implementation:
  // 1. Find all composite blocks
  // 2. For each, expand into derived blocks
  // 3. Remap edges
  // 4. Return modified patch + expansion info for debugging
}
```

## ID Generation Strategy

```typescript
// For a composite block with ID "myComposite"
// containing internal blocks "add1" and "mul1":

// Expanded block IDs:
"_comp_myComposite_add1"  // prefix + composite ID + internal ID
"_comp_myComposite_mul1"

// For nested composites (composite "outer" contains composite "inner"):
"_comp_outer__comp_inner_add1"  // nested prefixes
```

## State Key Strategy

```typescript
// Current format: "{blockId}:{primitiveKind}"
// New format for composites: "{compositePath}:{blockId}:{primitiveKind}"

// Example:
// UnitDelay inside composite "filter":
"filter:_comp_filter_delay:UnitDelay"

// Nested: UnitDelay inside "inner" inside "outer":
"outer/inner:_comp_outer__comp_inner_delay:UnitDelay"
```

## Existing Patterns to Follow

### Derived Block Role (from pass1-default-sources.ts)
```typescript
const derivedBlock: Block = {
  id: `_ds_${targetBlockId}_${portId}`,
  type: sourceBlockType,
  role: {
    kind: 'derived',
    meta: {
      kind: 'defaultSource',
      target: { kind: 'port', blockId: targetBlockId, portId },
    },
  },
  // ...
};
```

### ID Generation (from pass2-adapters.ts)
```typescript
const adapterId = `_adapter_${fromBlockId}_${toBlockId}_${toPort}`;
```

## Testing Strategy

### Unit Tests
- `src/blocks/__tests__/composite-types.test.ts` - Type validation
- `src/graph/passes/__tests__/pass0-composite-expansion.test.ts` - Expansion logic

### Integration Tests
- `src/compiler/__tests__/compile-composite.test.ts` - Full compilation

### Test Fixtures
```typescript
// Simple composite: Add two inputs and output
const simpleAddComposite: CompositeBlockDef = {
  type: 'AddTwo',
  form: 'composite',
  category: 'composite',
  label: 'Add Two',
  capability: 'pure',
  internalBlocks: new Map([
    ['add' as InternalBlockId, { type: 'Add' }],
  ]),
  internalEdges: [],
  exposedInputs: [
    { externalId: 'a', internalBlockId: 'add' as InternalBlockId, internalPortId: 'a' },
    { externalId: 'b', internalBlockId: 'add' as InternalBlockId, internalPortId: 'b' },
  ],
  exposedOutputs: [
    { externalId: 'out', internalBlockId: 'add' as InternalBlockId, internalPortId: 'out' },
  ],
  inputs: { /* computed */ },
  outputs: { /* computed */ },
};
```

## Edge Cases to Handle

1. **Empty composite** - Composite with no internal blocks (should error)
2. **Disconnected internal blocks** - Some blocks not connected to exposed ports
3. **Multiple exposed outputs from same internal port** - Should this be allowed?
4. **Composite using another composite** - Recursive expansion
5. **Self-referencing composite** - Must be detected and rejected
