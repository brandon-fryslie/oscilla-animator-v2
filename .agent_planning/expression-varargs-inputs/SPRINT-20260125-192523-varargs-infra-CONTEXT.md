# Implementation Context: varargs-infra

Generated: 2026-01-25-192523
Plan: SPRINT-20260125-192523-varargs-infra-PLAN.md

## File Locations

### Files to Modify

1. **`src/blocks/registry.ts`** - Add VarargInputDef types (lines 214-223)
2. **`src/graph/Patch.ts`** - Add VarargConnection to InputPort (lines 60-71)
3. **`src/graph/normalize.ts`** - Add varargs validation
4. **`src/compiler/passes-v2/pass6-block-lowering.ts`** - Add varargInputsById to LowerArgs

### New Files to Create

1. **`src/graph/passes/pass-varargs-validation.ts`** - Dedicated varargs pass

## VarargInputDef Type

### Current InputDef (src/blocks/registry.ts:214-223)

```typescript
export interface InputDef {
  readonly label?: string;
  readonly type: SignalType;
  readonly value?: unknown;
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;
  readonly exposedAsPort?: boolean;
  readonly optional?: boolean;
  readonly hidden?: boolean;
}
```

### Extended InputDef

Add after line 223:

```typescript
/**
 * Constraint for varargs inputs.
 * Varargs inputs accept 0..N connections without combining.
 */
export interface VarargConstraint {
  /** Required payload type for all connections */
  readonly payloadType: PayloadType;
  /** Cardinality constraint: signal, field, or any */
  readonly cardinalityConstraint: 'signal' | 'field' | 'any';
  /** Minimum required connections (default: 0) */
  readonly minConnections?: number;
  /** Maximum allowed connections (default: unlimited) */
  readonly maxConnections?: number;
}

export interface InputDef {
  readonly label?: string;
  readonly type: SignalType;
  readonly value?: unknown;
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;
  readonly exposedAsPort?: boolean;
  readonly optional?: boolean;
  readonly hidden?: boolean;
  /**
   * If true, this input accepts variable number of connections.
   * Must also specify varargConstraint.
   */
  readonly isVararg?: boolean;
  /** Constraint for varargs inputs. Required when isVararg is true. */
  readonly varargConstraint?: VarargConstraint;
}
```

### Type Guard

Add to `src/blocks/registry.ts`:

```typescript
/**
 * Check if an input definition is a varargs input.
 */
export function isVarargInput(def: InputDef): boolean {
  return def.isVararg === true && def.varargConstraint !== undefined;
}
```

## Varargs Port Representation

### Current InputPort (src/graph/Patch.ts:60-71)

```typescript
export interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
  readonly combineMode?: CombineMode;
}
```

### Extended InputPort

Add before InputPort interface:

```typescript
/**
 * A single connection to a varargs input.
 * Connections are ordered and reference outputs by canonical address.
 */
export interface VarargConnection {
  /** Canonical address of the source output (e.g., "blocks.b3.outputs.radius") */
  readonly sourceAddress: string;
  /** Optional user-provided alias for display (e.g., "Circle1.radius") */
  readonly alias?: string;
  /** Sort key for ordering connections (lower = first) */
  readonly sortKey: number;
}
```

Modify InputPort:

```typescript
export interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
  readonly combineMode?: CombineMode;
  /**
   * Varargs connections.
   * Only present for varargs inputs. Bypasses the edge/combine system.
   */
  readonly varargConnections?: readonly VarargConnection[];
}
```

### PatchBuilder Extension

Add to PatchBuilder class (around line 161):

```typescript
/**
 * Add a varargs connection to an input port.
 * @param blockId Target block
 * @param portId Target varargs input port
 * @param sourceAddress Canonical address of source output
 * @param sortKey Order in the varargs list
 */
addVarargConnection(
  blockId: BlockId,
  portId: string,
  sourceAddress: string,
  sortKey: number
): this {
  const block = this.blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const inputPort = block.inputPorts.get(portId);
  if (!inputPort) {
    throw new Error(`Input port ${portId} not found on block ${blockId}`);
  }

  const existingConnections = inputPort.varargConnections ?? [];
  const newConnection: VarargConnection = { sourceAddress, sortKey };

  // Update port with new connection
  const updatedPort: InputPort = {
    ...inputPort,
    varargConnections: [...existingConnections, newConnection].sort(
      (a, b) => a.sortKey - b.sortKey
    ),
  };

  // Update block with updated port
  const updatedPorts = new Map(block.inputPorts);
  updatedPorts.set(portId, updatedPort);

  this.blocks.set(blockId, {
    ...block,
    inputPorts: updatedPorts,
  });

  return this;
}
```

## Varargs Normalization Pass

### New File: src/graph/passes/pass-varargs-validation.ts

```typescript
/**
 * Varargs Validation Pass
 *
 * Validates and resolves varargs connections before type resolution.
 * Runs after pass1-default-sources, before pass4-types.
 */

import type { Block, Patch, VarargConnection } from '../Patch';
import type { CanonicalAddress, ResolvedAddress } from '../../types/canonical-address';
import { parseAddress, resolveAddress } from '../../types/canonical-address';
import { requireBlockDef, isVarargInput } from '../../blocks/registry';
import type { CompileError } from '../../compiler/errors';

export interface ResolvedVarargConnection {
  readonly sourceAddress: CanonicalAddress;
  readonly sourceBlockId: string;
  readonly sourcePortId: string;
  readonly resolvedType: import('../../core/canonical-types').SignalType;
}

export interface VarargValidationResult {
  readonly resolvedConnections: Map<string, Map<string, readonly ResolvedVarargConnection[]>>;
  readonly errors: readonly CompileError[];
}

export function validateVarargs(patch: Patch): VarargValidationResult {
  const resolvedConnections = new Map<string, Map<string, readonly ResolvedVarargConnection[]>>();
  const errors: CompileError[] = [];

  for (const [blockId, block] of patch.blocks) {
    const blockDef = requireBlockDef(block.type);
    const blockResolved = new Map<string, readonly ResolvedVarargConnection[]>();

    for (const [portId, inputPort] of block.inputPorts) {
      const inputDef = blockDef.inputs[portId];
      if (!inputDef || !isVarargInput(inputDef)) continue;

      const connections = inputPort.varargConnections ?? [];
      const resolvedList: ResolvedVarargConnection[] = [];

      for (const conn of connections) {
        // Parse address
        const addr = parseAddress(conn.sourceAddress);
        if (!addr) {
          errors.push({
            code: 'VARARG_INVALID_ADDRESS',
            message: `Invalid address format: ${conn.sourceAddress}`,
            blockId,
            portId,
          });
          continue;
        }

        if (addr.kind !== 'output') {
          errors.push({
            code: 'VARARG_NOT_OUTPUT',
            message: `Varargs must reference outputs, got ${addr.kind}: ${conn.sourceAddress}`,
            blockId,
            portId,
          });
          continue;
        }

        // Resolve address
        const resolved = resolveAddress(patch, conn.sourceAddress);
        if (!resolved || resolved.kind !== 'output') {
          errors.push({
            code: 'VARARG_UNRESOLVED',
            message: `Cannot resolve address: ${conn.sourceAddress}`,
            blockId,
            portId,
          });
          continue;
        }

        // Validate payload type constraint
        const constraint = inputDef.varargConstraint!;
        if (resolved.type.payload !== constraint.payloadType) {
          errors.push({
            code: 'VARARG_TYPE_MISMATCH',
            message: `Expected ${constraint.payloadType}, got ${resolved.type.payload} from ${conn.sourceAddress}`,
            blockId,
            portId,
          });
          continue;
        }

        // Validate cardinality constraint
        const cardinality = resolved.type.extent.cardinality;
        const cardinalityKind = cardinality.kind === 'default' ? 'one' :
          cardinality.value?.kind ?? 'one';

        if (constraint.cardinalityConstraint !== 'any') {
          const expectedCard = constraint.cardinalityConstraint === 'signal' ? 'one' : 'many';
          if (cardinalityKind !== expectedCard) {
            errors.push({
              code: 'VARARG_CARDINALITY_MISMATCH',
              message: `Expected ${constraint.cardinalityConstraint}, got ${cardinalityKind} cardinality from ${conn.sourceAddress}`,
              blockId,
              portId,
            });
            continue;
          }
        }

        resolvedList.push({
          sourceAddress: addr,
          sourceBlockId: addr.blockId,
          sourcePortId: addr.portId,
          resolvedType: resolved.type,
        });
      }

      // Validate connection count
      const constraint = inputDef.varargConstraint!;
      if (constraint.minConnections && resolvedList.length < constraint.minConnections) {
        errors.push({
          code: 'VARARG_MIN_CONNECTIONS',
          message: `Requires at least ${constraint.minConnections} connections, got ${resolvedList.length}`,
          blockId,
          portId,
        });
      }
      if (constraint.maxConnections && resolvedList.length > constraint.maxConnections) {
        errors.push({
          code: 'VARARG_MAX_CONNECTIONS',
          message: `Maximum ${constraint.maxConnections} connections allowed, got ${resolvedList.length}`,
          blockId,
          portId,
        });
      }

      blockResolved.set(portId, resolvedList);
    }

    if (blockResolved.size > 0) {
      resolvedConnections.set(blockId, blockResolved);
    }
  }

  return { resolvedConnections, errors };
}
```

## Varargs Block Lowering

### Current LowerArgs (src/blocks/registry.ts:46-51)

```typescript
export interface LowerArgs {
  readonly ctx: LowerCtx;
  readonly inputs: readonly import('../compiler/ir/lowerTypes').ValueRefPacked[];
  readonly inputsById: Record<string, import('../compiler/ir/lowerTypes').ValueRefPacked>;
  readonly config?: Readonly<Record<string, unknown>>;
}
```

### Extended LowerArgs

```typescript
export interface LowerArgs {
  readonly ctx: LowerCtx;
  readonly inputs: readonly import('../compiler/ir/lowerTypes').ValueRefPacked[];
  readonly inputsById: Record<string, import('../compiler/ir/lowerTypes').ValueRefPacked>;
  readonly config?: Readonly<Record<string, unknown>>;
  /**
   * Varargs inputs - array of values per varargs port.
   * Only present for blocks with varargs inputs.
   * Key is port ID, value is array of connected signals in sortKey order.
   */
  readonly varargInputsById?: Record<string, readonly import('../compiler/ir/lowerTypes').ValueRefPacked[]>;
}
```

### Block Lowering Changes (src/compiler/passes-v2/pass6-block-lowering.ts)

Around line 200, in the block lowering loop, add:

```typescript
// Resolve varargs inputs
const varargInputsById: Record<string, readonly ValueRefPacked[]> = {};
const varargValidation = ctx.varargValidation;

if (varargValidation) {
  const blockVarargs = varargValidation.resolvedConnections.get(block.id);
  if (blockVarargs) {
    for (const [portId, connections] of blockVarargs) {
      const values: ValueRefPacked[] = [];
      for (const conn of connections) {
        // Look up the output signal from the source block
        const sourceBlockIdx = blockIdToIndex.get(conn.sourceBlockId);
        if (sourceBlockIdx === undefined) continue;

        const sourceOutputs = blockOutputs.get(sourceBlockIdx);
        if (!sourceOutputs) continue;

        const sourceValue = sourceOutputs.get(conn.sourcePortId);
        if (sourceValue) {
          values.push(sourceValue);
        }
      }
      varargInputsById[portId] = values;
    }
  }
}

// Call block's lower function
const lowerArgs: LowerArgs = {
  ctx: lowerCtx,
  inputs: resolvedInputs,
  inputsById,
  config: block.params,
  varargInputsById: Object.keys(varargInputsById).length > 0 ? varargInputsById : undefined,
};
```

## Integration Points

### Normalization Pipeline (src/graph/normalize.ts)

The varargs validation pass should run after pass1 (default sources) and before pass4 (types):

```typescript
// Existing pipeline
const pass1Result = pass1DefaultSources(patch);
// NEW: Varargs validation
const varargResult = validateVarargs(pass1Result.patch);
if (varargResult.errors.length > 0) {
  return { errors: varargResult.errors };
}
// Continue with pass2, pass3, etc.
```

### Compile Context

Add vararg validation result to the compile context so pass6 can access it:

```typescript
interface CompileContext {
  // ... existing fields
  readonly varargValidation?: VarargValidationResult;
}
```

## Test Patterns

### Registry Tests

```typescript
describe('VarargInputDef', () => {
  it('defines a varargs input', () => {
    const def: InputDef = {
      label: 'Inputs',
      type: signalType('float'),
      isVararg: true,
      varargConstraint: {
        payloadType: 'float',
        cardinalityConstraint: 'any',
      },
    };
    expect(isVarargInput(def)).toBe(true);
  });

  it('regular input is not varargs', () => {
    const def: InputDef = {
      label: 'In',
      type: signalType('float'),
    };
    expect(isVarargInput(def)).toBe(false);
  });
});
```

### Patch Builder Tests

```typescript
describe('PatchBuilder varargs', () => {
  it('adds vararg connections', () => {
    const builder = new PatchBuilder();
    const circleId = builder.addBlock('Circle');
    const exprId = builder.addBlock('Expression');

    builder.addVarargConnection(
      exprId,
      'varargInputs',
      `blocks.${circleId}.outputs.radius`,
      0
    );

    const patch = builder.build();
    const exprBlock = patch.blocks.get(exprId)!;
    const port = exprBlock.inputPorts.get('varargInputs')!;

    expect(port.varargConnections).toHaveLength(1);
    expect(port.varargConnections![0].sourceAddress).toContain('radius');
  });
});
```

### Validation Tests

```typescript
describe('validateVarargs', () => {
  it('resolves valid connections', () => {
    // Build patch with Circle -> Expression vararg connection
    const result = validateVarargs(patch);
    expect(result.errors).toHaveLength(0);
    expect(result.resolvedConnections.size).toBe(1);
  });

  it('rejects non-float connections', () => {
    // Build patch with color output -> float vararg input
    const result = validateVarargs(patch);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'VARARG_TYPE_MISMATCH' })
    );
  });
});
```

## Adjacent Code Patterns

### Pattern: Normalization Pass (from pass1-default-sources.ts)

```typescript
export interface Pass1Result {
  readonly patch: Patch;
  readonly derivedBlocks: readonly DerivedBlock[];
  readonly derivedEdges: readonly DerivedEdge[];
}

export function pass1DefaultSources(patch: Patch): Pass1Result {
  // ... transform and return new patch
}
```

Follow this pattern for the varargs pass.

### Pattern: Error Type (from compiler/errors.ts)

```typescript
export interface CompileError {
  readonly code: string;
  readonly message: string;
  readonly blockId?: string;
  readonly portId?: string;
}
```

Use this interface for varargs errors.
