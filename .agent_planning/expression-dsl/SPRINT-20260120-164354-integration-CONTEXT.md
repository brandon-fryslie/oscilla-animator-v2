# Integration Sprint - Implementation Context

**Generated:** 2026-01-20 16:43:54
**Confidence:** HIGH
**Plan:** SPRINT-20260120-164354-integration-PLAN.md

## Purpose

This document contains comprehensive context for implementing Sprint 3 (Integration). An agent with ONLY this file should be able to implement the plan without needing to search the codebase extensively.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Files and Locations](#key-files-and-locations)
3. [Expression DSL Public API](#expression-dsl-public-api)
4. [Block Definition Pattern](#block-definition-pattern)
5. [Block Lowering Pattern](#block-lowering-pattern)
6. [Inspector UI Pattern](#inspector-ui-pattern)
7. [Diagnostics Pattern](#diagnostics-pattern)
8. [Testing Pattern](#testing-pattern)
9. [Code Snippets](#code-snippets)
10. [Type Signatures](#type-signatures)
11. [Error Handling](#error-handling)
12. [Common Pitfalls](#common-pitfalls)

---

## Architecture Overview

### Integration Flow

```
User Types Expression in Inspector
         ↓
Config Updated (config.expression = "sin(in0)")
         ↓
Patch Recompile Triggered
         ↓
Block Lowering Function Called
         ↓
compileExpression(text, inputs, builder, inputSignals)
         ↓
Returns: { ok: true, value: SigExprId } OR { ok: false, error: ... }
         ↓
If Success: Return output signal from lowering
If Error: Throw CompileError → shown in Inspector + Diagnostics
```

### Module Boundaries

**Expression DSL Module** (`src/expr/`):
- Isolated, zero external dependencies
- Public API: `compileExpression()` in `src/expr/index.ts`
- Internal: lexer, parser, type checker, IR compiler (hidden from rest of system)

**Block System** (`src/blocks/`):
- Block definitions with `registerBlock()`
- Each block has `lower` function that compiles to IR
- Expression block is just another block

**UI Layer** (`src/ui/components/`):
- `BlockInspector.tsx` detects Expression block type
- Shows custom text input for expression parameter
- Displays compile errors inline

**Compiler** (`src/compiler/`):
- Calls block `lower` functions during compilation
- Catches compile errors and emits diagnostics
- No special handling for Expression blocks

---

## Key Files and Locations

### Files to Create

1. **`src/blocks/expression-blocks.ts`** (or add to `src/blocks/math-blocks.ts`)
   - Expression block definition
   - Block lowering function
   - ~100 LOC

2. **`src/blocks/__tests__/expression-block.test.ts`**
   - Block definition tests
   - ~100 LOC

3. **`src/compiler/__tests__/expression-integration.test.ts`**
   - Lowering tests (expression → IR)
   - ~200 LOC

4. **`src/runtime/__tests__/expression-runtime.test.ts`**
   - Runtime execution tests
   - ~200 LOC

### Files to Modify

1. **`src/ui/components/BlockInspector.tsx`**
   - Add Expression block detection
   - Render custom expression text input
   - Display compile errors inline
   - ~50 LOC changes

2. **`src/compiler/passes-v2/pass4-lower.ts`** (maybe)
   - If special error handling needed
   - Likely no changes required (existing error handling works)

### Files to Read (Reference Only)

- `src/expr/index.ts` - Public API signature
- `src/expr/GRAMMAR.md` - Grammar reference
- `src/expr/FUNCTIONS.md` - Built-in functions
- `src/blocks/math-blocks.ts` - Example block definitions
- `src/blocks/registry.ts` - Block registry types
- `src/ui/components/BlockInspector.tsx` - UI patterns

---

## Expression DSL Public API

### Location

`src/expr/index.ts`

### Function Signature

```typescript
export function compileExpression(
  exprText: string,
  inputs: ReadonlyMap<string, CanonicalType>,
  builder: IRBuilder,
  inputSignals: ReadonlyMap<string, SigExprId>
): CompileResult;

export type CompileResult =
  | { ok: true; value: SigExprId }
  | { ok: false; error: ExpressionCompileError };

export interface ExpressionCompileError {
  readonly code: 'ExprSyntaxError' | 'ExprTypeError' | 'ExprCompileError';
  readonly message: string;
  readonly position?: { start: number; end: number };
  readonly suggestion?: string;
}
```

### Usage Example

```typescript
import { compileExpression } from '../expr';
import { canonicalType } from '../core/canonical-types';

// In block lowering function:
const inputs = new Map([
  ['in0', canonicalType('phase')],
  ['in1', canonicalType('float')],
]);

const inputSignals = new Map([
  ['in0', phaseSignalId],  // from inputsById.in0.id
  ['in1', radiusSignalId], // from inputsById.in1.id
]);

const result = compileExpression(
  "sin(in0 * 2) * in1",
  inputs,
  ctx.b,
  inputSignals
);

if (result.ok) {
  const sigId = result.value; // Use this as output
} else {
  throw new Error(`Expression error: ${result.error.message}`);
}
```

### Input Types

- `exprText`: Expression string from config parameter
- `inputs`: Map of input names → CanonicalType (for type checking)
  - Only include wired inputs (skip unwired optional inputs)
- `builder`: IRBuilder instance from `ctx.b`
- `inputSignals`: Map of input names → SigExprId (for IR generation)
  - Must match `inputs` keys exactly

### Output

- **Success:** `{ ok: true, value: SigExprId }` - Use `value` as output signal
- **Error:** `{ ok: false, error: ExpressionCompileError }` - Throw or display error

---

## Block Definition Pattern

### Location

`src/blocks/math-blocks.ts` (add to end) or new file `src/blocks/expression-blocks.ts`

### Template

```typescript
import { registerBlock } from './registry';
import { canonicalType } from '../core/canonical-types';
import { compileExpression } from '../expr';
import type { SigExprId } from '../compiler/ir/types';

registerBlock({
  type: 'Expression',
  label: 'Expression',
  category: 'math',
  description: 'Compute signal from mathematical expression',
  form: 'primitive',
  capability: 'pure',

  inputs: {
    in0: {
      label: 'In 0',
      type: canonicalType('???'),
      optional: true,
    },
    in1: {
      label: 'In 1',
      type: canonicalType('???'),
      optional: true,
    },
    in2: {
      label: 'In 2',
      type: canonicalType('???'),
      optional: true,
    },
    in3: {
      label: 'In 3',
      type: canonicalType('???'),
      optional: true,
    },
    in4: {
      label: 'In 4',
      type: canonicalType('???'),
      optional: true,
    },
  },

  outputs: {
    out: {
      label: 'Output',
      type: canonicalType('???'), // Inferred during lowering
    },
  },

  config: {
    expression: {
      label: 'Expression',
      type: canonicalType('???'), // Not used, just for schema
      exposedAsPort: false,   // Config-only, not wirable
      value: '',              // Default empty
      uiHint: {
        control: 'text',
        multiline: true,
      },
    },
  },

  lower: ({ ctx, inputsById, config }) => {
    // Implementation here (see next section)
  },
});
```

### Key Points

- **Type `'???'`**: Polymorphic type for inputs and output (actual types inferred)
- **`optional: true`**: Inputs can be unwired
- **`exposedAsPort: false`**: Expression is config-only, not a port
- **`uiHint`**: Tells Inspector to show multi-line text field
- **Config vs Inputs**: Expression is in `config`, not `inputs` (no wiring)

---

## Block Lowering Pattern

### Lowering Function Template

```typescript
lower: ({ ctx, inputsById, config }) => {
  // Step 1: Extract expression text from config
  const exprText = (config?.expression as string) ?? '';

  // Step 2: Handle empty expression (output constant 0)
  if (exprText.trim() === '') {
    const sigId = ctx.b.sigConst(0, canonicalType('float'));
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  }

  // Step 3: Build input type map (only wired inputs)
  const inputs = new Map<string, CanonicalType>();
  const inputSignals = new Map<string, SigExprId>();

  for (const key of ['in0', 'in1', 'in2', 'in3', 'in4']) {
    const input = inputsById[key];
    if (input && input.k === 'sig') {
      // Input is wired, include it
      // TODO: Get actual type from input (not just '???')
      inputs.set(key, canonicalType('???')); // FIXME: Use actual type
      inputSignals.set(key, input.id as SigExprId);
    }
  }

  // Step 4: Compile expression
  const result = compileExpression(exprText, inputs, ctx.b, inputSignals);

  // Step 5: Handle errors
  if (!result.ok) {
    throw new Error(
      `Expression compile error: ${result.error.message}` +
      (result.error.position ? ` at position ${result.error.position.start}` : '') +
      (result.error.suggestion ? `. ${result.error.suggestion}` : '')
    );
  }

  // Step 6: Return output signal
  const sigId = result.value;
  const slot = ctx.b.allocSlot();

  return {
    outputsById: {
      out: { k: 'sig', id: sigId, slot },
    },
  };
},
```

### Getting Input Types

**FIXME:** The template above uses `canonicalType('???')` for all inputs. This is incorrect but will work for v1 because the expression DSL type checker can infer types.

**Correct Approach (TODO):**

```typescript
// Get actual type from input signal
const inputType = ctx.inTypes[portIndex]; // or from block definition

// Example:
const in0Type = inputsById.in0?.type ?? canonicalType('???');
inputs.set('in0', in0Type);
```

**Challenge:** `inputsById` entries don't carry type information directly. Need to look up from `ctx.inTypes` using port index.

**Workaround for v1:** Use `'???'` and let expression type checker infer. This works because:
- Type checker can infer from operations (e.g., `sin(x)` → x must be numeric)
- Actual signal types are resolved during IR generation

**Fix in Sprint 4:** Pass actual input types for better type checking and error messages.

---

## Inspector UI Pattern

### Location

`src/ui/components/BlockInspector.tsx`

### Current Structure

The file has a `renderBlockParams()` function that iterates over config parameters and renders UI controls based on `uiHint`.

### Changes Needed

Add Expression block detection and custom rendering:

```typescript
// In renderBlockParams() function, after existing param rendering logic:

function renderBlockParams(block: Block, blockDef: BlockDef): React.ReactNode {
  // ... existing code ...

  // Special case: Expression block
  if (blockDef.type === 'Expression') {
    return renderExpressionInput(block, blockDef);
  }

  // ... existing param rendering ...
}

/**
 * Render custom expression input for Expression blocks.
 */
function renderExpressionInput(block: Block, blockDef: BlockDef): React.ReactNode {
  const exprValue = (block.config?.expression as string) ?? '';
  const [localValue, setLocalValue] = useState(exprValue);
  const [error, setError] = useState<string | null>(null);

  // Update local value when block changes
  useEffect(() => {
    setLocalValue(exprValue);
  }, [exprValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length > 500) return; // Character limit

    setLocalValue(newValue);
  };

  const handleBlur = () => {
    // Update config when user stops editing
    if (localValue !== exprValue) {
      rootStore.patchStore.updateBlockConfig(block.id, {
        expression: localValue,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      // Ctrl+Enter: trigger recompile
      handleBlur();
      // TODO: Trigger patch recompile
    }
  };

  // TODO: Get compile error from diagnostics or store
  // For now, just show if expression is invalid on blur
  useEffect(() => {
    // Validate expression (simple check for now)
    if (localValue.trim() !== '' && localValue.includes('@@')) {
      setError('Invalid syntax');
    } else {
      setError(null);
    }
  }, [localValue]);

  return (
    <div className="expression-input-container">
      <label className="param-label">Expression</label>
      <textarea
        className={`expression-textarea ${error ? 'error' : ''}`}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="e.g., sin(in0 * 2) + 0.5"
        rows={3}
        maxLength={500}
        style={{ fontFamily: 'monospace', fontSize: '12px' }}
      />
      <div className="char-counter">
        {localValue.length} / 500
      </div>
      {error && (
        <div className="error-message" style={{ color: colors.error }}>
          {error}
        </div>
      )}
    </div>
  );
}
```

### CSS Additions

Add to `BlockInspector.css`:

```css
.expression-input-container {
  margin-bottom: 12px;
}

.expression-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #444;
  border-radius: 4px;
  background: #1e1e1e;
  color: #fff;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  resize: vertical;
}

.expression-textarea.error {
  border-color: #f44336;
}

.expression-textarea:focus {
  outline: none;
  border-color: #64b5f6;
}

.char-counter {
  font-size: 10px;
  color: #888;
  text-align: right;
  margin-top: 4px;
}

.error-message {
  font-size: 11px;
  margin-top: 4px;
  color: #f44336;
}
```

### Getting Compile Errors

**TODO:** Wire up actual compile errors from diagnostics system.

For now, the error display is a placeholder. Real implementation:

1. When block lowering fails, error is emitted to `DiagnosticConsole`
2. Inspector queries diagnostics for errors related to current block
3. Display error inline if found

**Pattern:**

```typescript
// In renderExpressionInput:
const diagnostics = rootStore.diagnosticStore.getDiagnosticsForBlock(block.id);
const compileError = diagnostics.find(d => d.code.startsWith('Expr'));
const errorMessage = compileError?.message ?? null;
```

---

## Diagnostics Pattern

### Location

`src/compiler/passes-v2/pass4-lower.ts` (or wherever block lowering errors are caught)

### Current Error Handling

When block lowering throws an error, the compiler catches it and emits a diagnostic.

### No Changes Needed (Probably)

Expression block lowering will throw errors like:

```typescript
throw new Error('Expression compile error: Cannot add phase + phase. ...');
```

Existing error handling should catch this and emit diagnostic automatically.

### Verification

Check that diagnostics appear in `DiagnosticConsole` for expression errors. If not, add explicit diagnostic emission:

```typescript
// In compiler error handler:
if (error.message.startsWith('Expression compile error:')) {
  diagnosticStore.add({
    code: 'ExprSyntaxError', // or ExprTypeError
    message: error.message,
    target: { blockId: block.id },
    severity: 'error',
    stream: 'authoring',
    timestamp: Date.now(),
  });
}
```

---

## Testing Pattern

### Block Definition Tests

**File:** `src/blocks/__tests__/expression-block.test.ts`

```typescript
import { getBlockDefinition } from '../registry';
import { canonicalType } from '../../core/canonical-types';

describe('Expression Block Definition', () => {
  it('is registered in block registry', () => {
    const def = getBlockDefinition('Expression');
    expect(def).toBeDefined();
    expect(def?.type).toBe('Expression');
  });

  it('has correct metadata', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.category).toBe('math');
    expect(def?.form).toBe('primitive');
    expect(def?.capability).toBe('pure');
  });

  it('has 5 optional input ports', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.inputs).toBeDefined();
    expect(Object.keys(def!.inputs)).toEqual(['in0', 'in1', 'in2', 'in3', 'in4']);
    expect(def?.inputs.in0.optional).toBe(true);
  });

  it('has 1 output port', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.outputs).toBeDefined();
    expect(Object.keys(def!.outputs)).toEqual(['out']);
  });

  it('has expression config parameter', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.config?.expression).toBeDefined();
    expect(def?.config?.expression.exposedAsPort).toBe(false);
    expect(def?.config?.expression.uiHint?.control).toBe('text');
  });
});
```

### Lowering Tests

**File:** `src/compiler/__tests__/expression-integration.test.ts`

```typescript
import { createTestIRBuilder } from './test-utils';
import { getBlockDefinition } from '../../blocks/registry';
import { canonicalType } from '../../core/canonical-types';

describe('Expression Block Lowering', () => {
  let builder: IRBuilder;

  beforeEach(() => {
    builder = createTestIRBuilder();
  });

  it('compiles empty expression to constant 0', () => {
    const def = getBlockDefinition('Expression')!;
    const result = def.lower({
      ctx: {
        b: builder,
        blockIdx: 0,
        blockType: 'Expression',
        instanceId: 'inst_0',
        inTypes: [],
        outTypes: [],
        seedConstId: 0,
      },
      inputsById: {},
      config: { expression: '' },
    });

    expect(result.outputsById.out).toBeDefined();
    expect(result.outputsById.out.k).toBe('sig');
    // TODO: Verify it's sigConst(0, float)
  });

  it('compiles literal expression', () => {
    const def = getBlockDefinition('Expression')!;
    const result = def.lower({
      ctx: {
        b: builder,
        blockIdx: 0,
        blockType: 'Expression',
        instanceId: 'inst_0',
        inTypes: [],
        outTypes: [],
        seedConstId: 0,
      },
      inputsById: {},
      config: { expression: '42' },
    });

    expect(result.outputsById.out).toBeDefined();
    // TODO: Verify it's sigConst(42, int)
  });

  it('compiles binary operation', () => {
    // Create input signals
    const in0Sig = builder.sigConst(5, canonicalType('int'));
    const in1Sig = builder.sigConst(3, canonicalType('int'));

    const def = getBlockDefinition('Expression')!;
    const result = def.lower({
      ctx: {
        b: builder,
        blockIdx: 0,
        blockType: 'Expression',
        instanceId: 'inst_0',
        inTypes: [canonicalType('int'), canonicalType('int')],
        outTypes: [canonicalType('???')],
        seedConstId: 0,
      },
      inputsById: {
        in0: { k: 'sig', id: in0Sig, slot: 0 },
        in1: { k: 'sig', id: in1Sig, slot: 1 },
      },
      config: { expression: 'in0 + in1' },
    });

    expect(result.outputsById.out).toBeDefined();
    // TODO: Verify it's sigZip with Add opcode
  });

  it('throws error for syntax error', () => {
    const def = getBlockDefinition('Expression')!;
    expect(() => {
      def.lower({
        ctx: {
          b: builder,
          blockIdx: 0,
          blockType: 'Expression',
          instanceId: 'inst_0',
          inTypes: [],
          outTypes: [],
          seedConstId: 0,
        },
        inputsById: {},
        config: { expression: 'in0 +' },
      });
    }).toThrow(/Expression compile error/);
  });
});
```

### Runtime Tests

**File:** `src/runtime/__tests__/expression-runtime.test.ts`

```typescript
import { compilePatchToIR } from '../../compiler';
import { createRuntime } from '../../runtime';
import { createPatch } from '../../graph/Patch';

describe('Expression Block Runtime', () => {
  it('executes literal expression', () => {
    // Create patch with Expression block
    const patch = createPatch();
    const exprBlock = patch.addBlock('Expression', { expression: '42' });

    // Compile to IR
    const ir = compilePatchToIR(patch);

    // Create runtime and execute
    const runtime = createRuntime(ir);
    runtime.tick(0);

    // Get output value
    const outputSlot = /* TODO: get slot from compiled output */;
    const outputValue = runtime.getScalarValue(outputSlot);

    expect(outputValue).toBe(42);
  });

  it('executes binary operation', () => {
    const patch = createPatch();
    const const0 = patch.addBlock('Const', { value: 5 });
    const const1 = patch.addBlock('Const', { value: 3 });
    const expr = patch.addBlock('Expression', { expression: 'in0 + in1' });

    patch.connect(const0, 'out', expr, 'in0');
    patch.connect(const1, 'out', expr, 'in1');

    const ir = compilePatchToIR(patch);
    const runtime = createRuntime(ir);
    runtime.tick(0);

    const outputSlot = /* TODO: get slot */;
    const outputValue = runtime.getScalarValue(outputSlot);

    expect(outputValue).toBe(8);
  });

  it('executes function call', () => {
    const patch = createPatch();
    const const0 = patch.addBlock('Const', { value: 0 }); // sin(0) = 0
    const expr = patch.addBlock('Expression', { expression: 'sin(in0)' });

    patch.connect(const0, 'out', expr, 'in0');

    const ir = compilePatchToIR(patch);
    const runtime = createRuntime(ir);
    runtime.tick(0);

    const outputSlot = /* TODO: get slot */;
    const outputValue = runtime.getScalarValue(outputSlot);

    expect(outputValue).toBeCloseTo(0, 5);
  });
});
```

**Note:** Test utilities (`createTestIRBuilder`, `createPatch`, etc.) may need to be imported or created. Check existing test files for patterns.

---

## Code Snippets

### Import Expression DSL

```typescript
import { compileExpression, type ExpressionCompileError } from '../expr';
```

### Get Input Type (Workaround)

```typescript
// FIXME: This is a workaround because inputsById doesn't include type
function getInputType(inputsById: Record<string, ValueRefPacked>, key: string): CanonicalType {
  const input = inputsById[key];
  if (!input || input.k !== 'sig') {
    return canonicalType('???'); // Unknown/polymorphic
  }
  // TODO: Look up actual type from ctx.inTypes or block definition
  return canonicalType('???'); // Placeholder
}
```

### Allocate Output Slot

```typescript
const slot = ctx.b.allocSlot();
```

### Return Output Signal

```typescript
return {
  outputsById: {
    out: { k: 'sig', id: sigId, slot },
  },
};
```

### Throw Compile Error

```typescript
if (!result.ok) {
  const err = result.error;
  throw new Error(
    `Expression error (${err.code}): ${err.message}` +
    (err.position ? ` at position ${err.position.start}` : '') +
    (err.suggestion ? `. ${err.suggestion}` : '')
  );
}
```

---

## Type Signatures

### IRBuilder (Relevant Methods)

```typescript
interface IRBuilder {
  sigConst(value: number, type: CanonicalType): SigExprId;
  sigMap(input: SigExprId, fn: MapFnId, type: CanonicalType): SigExprId;
  sigZip(inputs: SigExprId[], fn: ZipFnId, type: CanonicalType): SigExprId;
  opcode(op: OpCode): MapFnId | ZipFnId;
  allocSlot(): Slot;
}
```

### LowerCtx

```typescript
interface LowerCtx {
  readonly blockIdx: BlockIndex;
  readonly blockType: string;
  readonly instanceId: string;
  readonly label?: string;
  readonly inTypes: readonly CanonicalType[];
  readonly outTypes: readonly CanonicalType[];
  readonly b: IRBuilder;
  readonly seedConstId: number;
  readonly instance?: InstanceId;
  readonly inferredInstance?: InstanceId;
}
```

### ValueRefPacked (Input/Output Reference)

```typescript
type ValueRefPacked =
  | { k: 'sig'; id: SigExprId; slot: Slot }
  | { k: 'field'; id: FieldExprId; slots: Slot[] }
  | { k: 'trigger'; id: TriggerExprId };
```

### CanonicalType

```typescript
interface CanonicalType {
  payload: PayloadType;
  extent: Extent;
}

type PayloadType = 'float' | 'int' | 'bool' | 'phase' | 'unit' | 'vec2' | 'color' | '???';
```

---

## Error Handling

### Expression Compile Errors

```typescript
interface ExpressionCompileError {
  readonly code: 'ExprSyntaxError' | 'ExprTypeError' | 'ExprCompileError';
  readonly message: string;
  readonly position?: { start: number; end: number };
  readonly suggestion?: string;
}
```

### Error Messages (Examples)

**Syntax Error:**
```
Syntax error at position 12: Expected expression after '+'
```

**Type Error:**
```
Type error at position 6 ('+' operator): Cannot add phase + phase.
Suggestion: Use 'phase + float' for offset.
```

**Undefined Identifier:**
```
Undefined input 'foo' at position 0. Available inputs: in0, in1
```

**Arity Error:**
```
Function 'sin' expects 1 argument, got 2
```

### Converting to CompileError

```typescript
// In block lowering:
if (!result.ok) {
  const err = result.error;
  throw new Error(
    `Expression ${err.code}: ${err.message}` +
    (err.position ? ` (position ${err.position.start})` : '') +
    (err.suggestion ? `\n${err.suggestion}` : '')
  );
}
```

---

## Common Pitfalls

### 1. Forgetting to Check if Input is Wired

❌ **Wrong:**
```typescript
inputs.set('in0', canonicalType('???'));
inputSignals.set('in0', inputsById.in0.id); // CRASHES if in0 unwired
```

✅ **Correct:**
```typescript
if (inputsById.in0 && inputsById.in0.k === 'sig') {
  inputs.set('in0', canonicalType('???'));
  inputSignals.set('in0', inputsById.in0.id as SigExprId);
}
```

### 2. Using Wrong Type for Config Parameter

❌ **Wrong:**
```typescript
inputs: {
  expression: { ... } // Config param should NOT be in inputs
}
```

✅ **Correct:**
```typescript
config: {
  expression: { exposedAsPort: false, ... }
}
```

### 3. Forgetting to Allocate Slot

❌ **Wrong:**
```typescript
return {
  outputsById: {
    out: { k: 'sig', id: sigId }, // Missing slot!
  },
};
```

✅ **Correct:**
```typescript
const slot = ctx.b.allocSlot();
return {
  outputsById: {
    out: { k: 'sig', id: sigId, slot },
  },
};
```

### 4. Not Handling Empty Expression

❌ **Wrong:**
```typescript
const result = compileExpression(exprText, ...); // Crashes on empty string
```

✅ **Correct:**
```typescript
if (exprText.trim() === '') {
  // Return constant 0 for empty expression
  const sigId = ctx.b.sigConst(0, canonicalType('float'));
  const slot = ctx.b.allocSlot();
  return { outputsById: { out: { k: 'sig', id: sigId, slot } } };
}
```

### 5. Mismatched Input Names

❌ **Wrong:**
```typescript
inputs.set('phase', ...); // Name doesn't match port ID
```

✅ **Correct:**
```typescript
inputs.set('in0', ...); // Must match port ID exactly
```

### 6. Forgetting to Import compileExpression

❌ **Wrong:**
```typescript
// No import, compileExpression is undefined
```

✅ **Correct:**
```typescript
import { compileExpression } from '../expr';
```

---

## Implementation Checklist

Use this checklist while implementing to ensure all integration points are covered:

### Block Definition
- [ ] Create `src/blocks/expression-blocks.ts` (or add to math-blocks.ts)
- [ ] Import `registerBlock`, `canonicalType`, `compileExpression`
- [ ] Register Expression block with correct metadata
- [ ] Define 5 optional input ports (in0-in4)
- [ ] Define 1 output port (out)
- [ ] Define expression config parameter
- [ ] Implement `lower` function

### Block Lowering
- [ ] Extract expression text from config
- [ ] Handle empty expression (return constant 0)
- [ ] Build input type map (only wired inputs)
- [ ] Build input signal map (only wired inputs)
- [ ] Call `compileExpression()`
- [ ] Handle success case (return output signal)
- [ ] Handle error case (throw with clear message)
- [ ] Allocate output slot

### Inspector UI
- [ ] Detect Expression block type in `renderBlockParams()`
- [ ] Create `renderExpressionInput()` function
- [ ] Add multi-line textarea with monospace font
- [ ] Add character counter (500 char limit)
- [ ] Add error display (red border + message)
- [ ] Handle onChange, onBlur, onKeyDown
- [ ] Update block config on blur
- [ ] Add CSS styles for expression input

### Diagnostics
- [ ] Verify expression errors appear in DiagnosticConsole
- [ ] Verify error format (code, message, target)
- [ ] Verify click on diagnostic focuses block
- [ ] Verify error clears when expression fixed

### Tests - Block Definition
- [ ] Test block is registered
- [ ] Test block metadata (category, form, capability)
- [ ] Test input port configuration
- [ ] Test output port configuration
- [ ] Test config parameter configuration

### Tests - Lowering
- [ ] Test empty expression → constant 0
- [ ] Test literal expression → constant
- [ ] Test binary operation → zip + opcode
- [ ] Test function call → map + opcode
- [ ] Test complex expression → nested IR
- [ ] Test syntax error → throw
- [ ] Test type error → throw
- [ ] Test undefined identifier → throw

### Tests - Runtime
- [ ] Test literal execution
- [ ] Test binary op execution
- [ ] Test function execution
- [ ] Test complex expression execution
- [ ] Verify output values are correct

### Polish
- [ ] Review error messages for clarity
- [ ] Test with non-technical user
- [ ] Verify no regressions in existing tests
- [ ] Verify bundle size impact (<5 KB)

---

## Summary

This context document provides everything needed to implement Sprint 3 (Integration):

1. **Public API**: `compileExpression()` signature and usage
2. **Block Pattern**: Template for Expression block definition
3. **Lowering Pattern**: Step-by-step lowering implementation
4. **UI Pattern**: Inspector integration with custom text input
5. **Testing Pattern**: Block, lowering, and runtime test examples
6. **Code Snippets**: Reusable code for common operations
7. **Error Handling**: Error types and conversion patterns
8. **Pitfalls**: Common mistakes to avoid

**Next Steps:**
1. Create Expression block definition
2. Implement lowering function
3. Add Inspector UI integration
4. Write tests (block, lowering, runtime)
5. Verify diagnostics integration
6. Polish error messages

**Estimated Effort:** 4-6 hours for core implementation + 2-3 hours for tests = ~6-9 hours total.

