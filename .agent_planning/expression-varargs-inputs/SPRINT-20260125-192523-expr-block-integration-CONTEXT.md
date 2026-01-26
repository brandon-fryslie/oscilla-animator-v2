# Implementation Context: expr-block-integration

Generated: 2026-01-25-192523
Plan: SPRINT-20260125-192523-expr-block-integration-PLAN.md

## File Locations

### Files to Modify

1. **`src/blocks/expression-blocks.ts`** - Add varargs input, update lower function
2. **`src/blocks/registry.ts`** - Extend LowerCtx
3. **`src/compiler/passes-v2/pass6-block-lowering.ts`** - Populate varargs context

### New Files to Create

1. **`src/blocks/__tests__/expression-varargs.test.ts`** - Integration tests

## Expression Block Varargs Input

### Current Expression Block Definition (src/blocks/expression-blocks.ts:29-106)

The inputs section currently has:
- in0, in1, in2, in3, in4 (optional fixed inputs)
- expression (config parameter)

### Add Refs Varargs Input

After the fixed inputs (around line 89), add:

```typescript
inputs: {
  // Existing fixed inputs (keep all of these)
  in0: {
    label: 'In 0',
    type: signalType('float'),
    optional: true,
    exposedAsPort: true,
  },
  in1: { /* ... */ },
  in2: { /* ... */ },
  in3: { /* ... */ },
  in4: { /* ... */ },

  // NEW: Varargs input for block output references
  refs: {
    label: 'Block References',
    type: signalType('float'),
    isVararg: true,
    varargConstraint: {
      payloadType: 'float',
      cardinalityConstraint: 'any', // Accept Signal or Field
    },
    exposedAsPort: false, // Not a traditional wirable port
    hidden: true,         // Hide from standard port UI (has custom UI)
    optional: true,       // Can have zero references
  },

  // Existing config parameter
  expression: {
    label: 'Expression',
    type: signalType('float'),
    exposedAsPort: false,
    value: '',
    uiHint: { kind: 'text' },
  },
},
```

## Expression Block Lower Function

### Current Lower Function (src/blocks/expression-blocks.ts:125-196)

Key sections:
1. Extract expression text from config (line 127)
2. Handle empty expression (lines 129-138)
3. Build input type/signal maps for in0-in4 (lines 141-165)
4. Call compileExpression (line 168)
5. Handle result (lines 170-195)

### Updated Lower Function

```typescript
lower: ({ ctx, inputsById, varargInputsById, config }) => {
  // Step 1: Extract expression text from config
  const exprText = (config?.expression as string | undefined) ?? '';

  // Step 2: Handle empty expression (output constant 0)
  if (exprText.trim() === '') {
    const sigId = ctx.b.sigConst(0, signalType('float'));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  }

  // Step 3 & 4: Build input type map and signal map (fixed inputs)
  const inputs = new Map<string, SignalType>();
  const inputSignals = new Map<string, SigExprId>();

  const getSigType = (sigId: SigExprId): SignalType => {
    const sigExprs = ctx.b.getSigExprs();
    const sigExpr = sigExprs[sigId as number];
    if (!sigExpr) {
      throw new Error(`Signal expression ${sigId} not found`);
    }
    return sigExpr.type;
  };

  // Process fixed input ports (in0-in4) - unchanged
  for (const key of ['in0', 'in1', 'in2', 'in3', 'in4'] as const) {
    const input = inputsById[key];
    if (input && input.k === 'sig') {
      const inputType = getSigType(input.id as SigExprId);
      inputs.set(key, inputType);
      inputSignals.set(key, input.id as SigExprId);
    }
  }

  // NEW: Build block reference context from varargs
  let blockRefsContext: {
    addressRegistry: AddressRegistry;
    allowedPayloads: readonly PayloadType[];
    signals: ReadonlyMap<string, SigExprId>;
  } | undefined;

  if (varargInputsById?.refs && ctx.addressRegistry && ctx.varargConnections) {
    const refValues = varargInputsById.refs;
    const connections = ctx.varargConnections.get('refs') ?? [];
    const refSignals = new Map<string, SigExprId>();

    // Map each vararg connection to its signal ID
    for (let i = 0; i < connections.length && i < refValues.length; i++) {
      const conn = connections[i];
      const value = refValues[i];

      if (value.k === 'sig') {
        // Build alias for this connection
        // Use the user-provided alias if available, otherwise build from address
        const sourceBlock = ctx.addressRegistry.resolve(
          `blocks.${conn.sourceBlockId}`
        );
        const blockName = sourceBlock?.kind === 'block'
          ? (sourceBlock.block.displayName || conn.sourceBlockId)
          : conn.sourceBlockId;
        const alias = `${blockName}.${conn.sourcePortId}`;

        refSignals.set(alias, value.id as SigExprId);
      }
    }

    if (refSignals.size > 0) {
      blockRefsContext = {
        addressRegistry: ctx.addressRegistry,
        allowedPayloads: ['float'],
        signals: refSignals,
      };
    }
  }

  // Step 5: Compile expression using Expression DSL
  const result = compileExpression(
    exprText,
    inputs,
    ctx.b,
    inputSignals,
    blockRefsContext
  );

  // Step 6 & 7: Handle compilation result (unchanged)
  if (!result.ok) {
    const err = result.error;
    const positionInfo = err.position
      ? ` at position ${err.position.start}`
      : '';
    const suggestionInfo = err.suggestion
      ? `\nSuggestion: ${err.suggestion}`
      : '';

    throw new Error(
      `Expression ${err.code}: ${err.message}${positionInfo}${suggestionInfo}`
    );
  }

  const sigId = result.value;
  const outType = ctx.outTypes[0];
  const slot = ctx.b.allocSlot();

  return {
    outputsById: {
      out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
    },
  };
},
```

### Imports to Add

At the top of `src/blocks/expression-blocks.ts`:

```typescript
import type { AddressRegistry } from '../types/canonical-address';
import type { PayloadType } from '../core/canonical-types';
```

## LowerCtx Extension

### Current LowerCtx (src/blocks/registry.ts:20-41)

```typescript
export interface LowerCtx {
  readonly blockIdx: BlockIndex;
  readonly blockType: string;
  readonly instanceId: string;
  readonly label?: string;
  readonly inTypes: readonly SignalType[];
  readonly outTypes: readonly SignalType[];
  readonly b: IRBuilder;
  readonly seedConstId: number;
  readonly instance?: InstanceId;
  readonly inferredInstance?: InstanceId;
}
```

### Extended LowerCtx

Add imports at top:
```typescript
import type { AddressRegistry, ResolvedVarargConnection } from '../types/canonical-address';
```

Extend interface:
```typescript
export interface LowerCtx {
  readonly blockIdx: BlockIndex;
  readonly blockType: string;
  readonly instanceId: string;
  readonly label?: string;
  readonly inTypes: readonly SignalType[];
  readonly outTypes: readonly SignalType[];
  readonly b: IRBuilder;
  readonly seedConstId: number;
  readonly instance?: InstanceId;
  readonly inferredInstance?: InstanceId;

  // Varargs support
  /**
   * Address registry for resolving block references.
   * Available when the patch has been normalized with varargs validation.
   */
  readonly addressRegistry?: AddressRegistry;

  /**
   * Resolved varargs connections by port ID.
   * Key is the varargs port ID (e.g., 'refs' for Expression block).
   * Value is array of resolved connections in sortKey order.
   */
  readonly varargConnections?: ReadonlyMap<string, readonly ResolvedVarargConnection[]>;
}
```

## Block Lowering Pass Changes

### Current Pass6 (src/compiler/passes-v2/pass6-block-lowering.ts)

The pass iterates over blocks and calls their `lower` functions with a `LowerArgs` object.

### Populate Varargs Context

In the block lowering loop, when constructing `lowerCtx`:

```typescript
// Build lowerCtx for each block
const lowerCtx: LowerCtx = {
  blockIdx: i as BlockIndex,
  blockType: block.type,
  instanceId: block.id,
  label: block.displayName ?? undefined,
  inTypes: inputTypes,
  outTypes: outputTypes,
  b: builder,
  seedConstId: seedConstId++,
  instance: instanceContext,
  inferredInstance: inferredInstance,

  // NEW: Varargs context
  addressRegistry: ctx.addressRegistry,
  varargConnections: getVarargConnectionsForBlock(block.id, ctx.varargValidation),
};

// Helper function
function getVarargConnectionsForBlock(
  blockId: string,
  validation?: VarargValidationResult
): ReadonlyMap<string, readonly ResolvedVarargConnection[]> | undefined {
  if (!validation) return undefined;
  const blockConnections = validation.resolvedConnections.get(blockId);
  if (!blockConnections || blockConnections.size === 0) return undefined;
  return blockConnections;
}
```

### Compile Context Extension

The compile context passed through the passes needs to include:

```typescript
interface CompileContext {
  // ... existing fields
  readonly addressRegistry?: AddressRegistry;
  readonly varargValidation?: VarargValidationResult;
}
```

This is populated during the early normalization/validation phase.

## Integration Test File

### Create: src/blocks/__tests__/expression-varargs.test.ts

```typescript
import { PatchBuilder } from '../../graph/Patch';
import { compilePatch } from '../../compiler/compile';
import { signalType } from '../../core/canonical-types';

describe('Expression Block with Varargs', () => {
  describe('block reference compilation', () => {
    it('compiles expression with single block reference', () => {
      const builder = new PatchBuilder();

      // Create Circle block
      const circleId = builder.addBlock('Circle', {}, {
        displayName: 'Circle1',
      });

      // Create Expression block
      const exprId = builder.addBlock('Expression', {
        expression: 'Circle1.radius * 2',
      });

      // Add vararg connection
      builder.addVarargConnection(
        exprId,
        'refs',
        `blocks.${circleId}.outputs.radius`,
        0
      );

      // Compile
      const patch = builder.build();
      const result = compilePatch(patch);

      // Verify
      expect(result.errors).toHaveLength(0);
      expect(result.program).toBeDefined();
    });

    it('compiles expression with multiple block references', () => {
      const builder = new PatchBuilder();

      const circleId = builder.addBlock('Circle', {}, { displayName: 'Circle1' });
      const oscId = builder.addBlock('Oscillator', {}, { displayName: 'Osc1' });
      const exprId = builder.addBlock('Expression', {
        expression: 'Circle1.radius + Osc1.out',
      });

      builder.addVarargConnection(exprId, 'refs', `blocks.${circleId}.outputs.radius`, 0);
      builder.addVarargConnection(exprId, 'refs', `blocks.${oscId}.outputs.out`, 1);

      const result = compilePatch(builder.build());
      expect(result.errors).toHaveLength(0);
    });

    it('compiles expression mixing fixed inputs and block references', () => {
      const builder = new PatchBuilder();

      const circleId = builder.addBlock('Circle', {}, { displayName: 'Circle1' });
      const constId = builder.addBlock('Const', { value: 0.5 });
      const exprId = builder.addBlock('Expression', {
        expression: 'in0 * Circle1.radius',
      });

      // Wire fixed input
      builder.wire(constId, 'out', exprId, 'in0');

      // Add block reference
      builder.addVarargConnection(exprId, 'refs', `blocks.${circleId}.outputs.radius`, 0);

      const result = compilePatch(builder.build());
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('rejects reference to unknown block', () => {
      const builder = new PatchBuilder();
      const exprId = builder.addBlock('Expression', {
        expression: 'UnknownBlock.radius',
      });

      // No vararg connection for UnknownBlock

      const result = compilePatch(builder.build());
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Unknown');
    });

    it('rejects reference to non-float output', () => {
      const builder = new PatchBuilder();

      // Create a block with color output
      const colorId = builder.addBlock('HueToColor', {}, { displayName: 'Color1' });
      const exprId = builder.addBlock('Expression', {
        expression: 'Color1.out',
      });

      // Try to connect color output (type mismatch)
      builder.addVarargConnection(exprId, 'refs', `blocks.${colorId}.outputs.out`, 0);

      const result = compilePatch(builder.build());
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('float');
    });
  });

  describe('cardinality handling', () => {
    it('propagates signal cardinality', () => {
      const builder = new PatchBuilder();

      const circleId = builder.addBlock('Circle', {}, { displayName: 'Circle1' });
      const exprId = builder.addBlock('Expression', {
        expression: 'Circle1.radius',
      });

      builder.addVarargConnection(exprId, 'refs', `blocks.${circleId}.outputs.radius`, 0);

      const result = compilePatch(builder.build());
      expect(result.errors).toHaveLength(0);

      // Output should be signal cardinality (one)
      // Check via schedule or slot metadata
    });

    // Field cardinality test would require Array block setup
  });
});
```

## Adjacent Code Patterns

### Pattern: Block Lower Function (from expression-blocks.ts:125-196)

The existing lower function shows the pattern:
1. Extract config
2. Handle edge cases (empty expression)
3. Build input maps
4. Call compiler
5. Handle result

Follow this pattern, extending steps 3 and 4 for varargs.

### Pattern: LowerArgs Usage (from pass6-block-lowering.ts)

```typescript
const lowerArgs: LowerArgs = {
  ctx: lowerCtx,
  inputs: resolvedInputs,
  inputsById,
  config: block.params,
  varargInputsById: hasVarargs ? varargInputsById : undefined,
};

const lowerResult = blockDef.lower(lowerArgs);
```

Follow this pattern for providing varargs.

### Pattern: Integration Test (from compiler/__tests__/compile.test.ts)

```typescript
describe('compilePatch', () => {
  it('compiles minimal patch', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', { value: 1 });
    const result = compilePatch(builder.build());
    expect(result.errors).toHaveLength(0);
  });
});
```

Follow this pattern for integration tests.
