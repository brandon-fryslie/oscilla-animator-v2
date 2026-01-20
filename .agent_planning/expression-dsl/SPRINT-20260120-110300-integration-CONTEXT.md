# Integration Sprint - Implementation Context

Generated: 2026-01-20 11:03:00
Confidence: HIGH (after core implementation completes)
Plan: SPRINT-20260120-110300-integration-PLAN.md

## Purpose

This document provides comprehensive context for integrating the Expression DSL with the block system and UI. An agent with ONLY this document and the core implementation should be able to complete the integration.

## Prerequisites (MUST EXIST FIRST)

Before starting this sprint, you MUST have completed the core implementation sprint with these deliverables:

1. `src/expr/index.ts` - compileExpression() API
2. `src/expr/ast.ts` - AST types
3. `src/expr/parser.ts` - Parser
4. `src/expr/typecheck.ts` - Type checker
5. `src/expr/compile.ts` - IR compiler
6. All unit tests passing

**Verify:** Run `npm test src/expr` → all tests pass

## Integration Architecture

```
┌─────────────────┐
│  Block Library  │ (UI)
│    Palette      │
└────────┬────────┘
         │ User adds Expression block
         ▼
┌─────────────────┐
│ Expression Block│ (src/blocks/expression-block.ts)
│   [NEW CODE]    │
└────────┬────────┘
         │
         ├─► Config: expression string
         ├─► Inputs: dynamic based on expression
         └─► Lower: calls compileExpression()
                │
                ▼
         ┌─────────────────┐
         │ compileExpression│ (src/expr/index.ts)
         │   [ALREADY DONE] │
         └─────────┬────────┘
                   │
                   ▼
         ┌─────────────────┐
         │    SigExprId    │ (IR)
         └─────────────────┘

┌─────────────────┐
│ Block Inspector │ (UI)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ExpressionInput │ (src/ui/components/params/ExpressionInput.tsx)
│   [NEW CODE]    │
└────────┬────────┘
         │
         ├─► Validates expression
         ├─► Shows errors inline
         └─► Updates block config
```

## Implementation Tasks

### Task 1: Expression Block Implementation

**File:** `src/blocks/expression-block.ts`

**Purpose:** Register the user-facing Expression block that wraps the DSL compiler.

**Implementation:**

```typescript
/**
 * Expression Block
 *
 * Allows users to type mathematical expressions that compile to IR.
 */

import { registerBlock } from './registry';
import { signalType } from '../core/canonical-types';
import { compileExpression } from '../expr';
import type { LowerArgs } from './registry';

// For v1: Explicit input declaration
// User must declare inputs separately from expression
// Future enhancement: Parse expression to infer inputs

registerBlock({
  type: 'Expression',
  label: 'Expression',
  category: 'signal',
  description: 'Evaluate mathematical expression',
  form: 'primitive',
  capability: 'pure',

  inputs: {
    // Expression string (config-only, not a port)
    expression: {
      type: signalType('???'),  // Not actually used as signal
      value: '',
      exposedAsPort: false,
      uiHint: { kind: 'expression' },  // Custom UI hint for expression input
    },

    // Example explicit inputs
    // For expression "sin(phase * 2)", user would wire:
    a: {
      label: 'A',
      type: signalType('???'),  // Polymorphic
      optional: true,
    },
    b: {
      label: 'B',
      type: signalType('???'),
      optional: true,
    },
    c: {
      label: 'C',
      type: signalType('???'),
      optional: true,
    },
  },

  outputs: {
    out: {
      label: 'Output',
      type: signalType('???'),  // Resolved from expression
    },
  },

  lower: ({ ctx, inputsById, config }: LowerArgs) => {
    // Get expression string
    const exprString = config?.expression as string;
    if (!exprString || exprString.trim() === '') {
      throw new Error('Expression block requires expression string');
    }

    // Collect input types from connected ports
    const inputTypes = new Map<string, SignalType>();
    const inputExprs = new Map<string, SigExprId>();

    for (const [name, valueRef] of Object.entries(inputsById)) {
      if (name === 'expression') continue;  // Skip config parameter
      if (!valueRef || valueRef.k !== 'sig') continue;

      // Get type from connection
      const inputIdx = ctx.inTypes.findIndex((_, i) => {
        const port = ctx.blockIdx.inputs[i];
        return port.name === name;
      });
      if (inputIdx >= 0) {
        const inputType = ctx.inTypes[inputIdx];
        inputTypes.set(name, inputType);
        inputExprs.set(name, valueRef.id as SigExprId);
      }
    }

    // Compile expression
    const result = compileExpression(exprString, inputTypes, inputExprs, ctx.b);

    if (!result.ok) {
      // Convert to CompileError (already in correct format)
      throw result.error;
    }

    const sigId = result.value;
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});
```

**Testing:**

Create `src/blocks/__tests__/expression-block.test.ts`:

```typescript
import { getBlockDef } from '../registry';
import { signalType } from '../../core/canonical-types';
import { IRBuilderImpl } from '../../compiler/ir/IRBuilderImpl';

describe('Expression Block', () => {
  test('lowers simple expression', () => {
    const blockDef = getBlockDef('Expression');
    expect(blockDef).toBeDefined();

    const builder = new IRBuilderImpl();
    const phaseId = builder.sigTime('phaseA', signalType('phase'));

    const result = blockDef.lower({
      ctx: {
        b: builder,
        blockIdx: { ... },
        inTypes: [signalType('phase')],
        // ... other ctx fields
      },
      inputsById: {
        a: { k: 'sig', id: phaseId, slot: 0 }
      },
      config: { expression: 'a * 2' }
    });

    expect(result.outputsById.out).toBeDefined();
    expect(result.outputsById.out.k).toBe('sig');
  });

  test('throws on syntax error', () => {
    const blockDef = getBlockDef('Expression');
    const builder = new IRBuilderImpl();

    expect(() => {
      blockDef.lower({
        ctx: { b: builder, ... },
        inputsById: {},
        config: { expression: 'a +' }  // Syntax error
      });
    }).toThrow();
  });

  test('throws on type error', () => {
    const blockDef = getBlockDef('Expression');
    const builder = new IRBuilderImpl();
    const phaseId = builder.sigTime('phaseA', signalType('phase'));

    expect(() => {
      blockDef.lower({
        ctx: { b: builder, ... },
        inputsById: {
          a: { k: 'sig', id: phaseId, slot: 0 },
          b: { k: 'sig', id: phaseId, slot: 1 }
        },
        config: { expression: 'a + a' }  // phase + phase → ERROR
      });
    }).toThrow(/type error/i);
  });
});
```

### Task 2: Expression Input UI Component

**File:** `src/ui/components/params/ExpressionInput.tsx`

**Purpose:** Custom UI control for editing expression strings with validation feedback.

**Implementation:**

```typescript
import React, { useState, useCallback } from 'react';
import { TextField, Box, Typography } from '@mui/material';
import { compileExpression } from '../../../expr';
import { IRBuilderImpl } from '../../../compiler/ir/IRBuilderImpl';
import type { SignalType } from '../../../core/canonical-types';

interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  inputTypes: Map<string, SignalType>;
  label?: string;
}

export function ExpressionInput({
  value,
  onChange,
  inputTypes,
  label = 'Expression'
}: ExpressionInputProps) {
  const [error, setError] = useState<string | null>(null);

  const validateExpression = useCallback((expr: string) => {
    if (!expr || expr.trim() === '') {
      setError(null);
      return;
    }

    // Use mock builder for validation only
    const builder = new IRBuilderImpl();

    // Create dummy input expressions for validation
    const dummyInputs = new Map<string, SigExprId>();
    for (const [name, type] of inputTypes.entries()) {
      const dummyId = builder.sigConst(0, type);
      dummyInputs.set(name, dummyId);
    }

    const result = compileExpression(expr, inputTypes, dummyInputs, builder);

    if (!result.ok) {
      setError(result.error.message);
    } else {
      setError(null);
    }
  }, [inputTypes]);

  const handleChange = useCallback((newValue: string) => {
    onChange(newValue);
    validateExpression(newValue);
  }, [onChange, validateExpression]);

  return (
    <Box>
      <TextField
        label={label}
        multiline
        rows={3}
        value={value}
        onChange={e => handleChange(e.target.value)}
        error={!!error}
        helperText={error || 'e.g., sin(phase * 2) + 0.5'}
        fullWidth
        sx={{
          fontFamily: 'monospace',
          '& .MuiInputBase-input': {
            fontFamily: 'monospace',
          }
        }}
      />
      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
```

**Integration with Block Inspector:**

Update parameter control renderer to use ExpressionInput when `uiHint.kind === 'expression'`:

```typescript
// In src/ui/components/inspector/ParamControl.tsx (or similar)

function renderParamControl(param: ParamDef, value: unknown, onChange: (v: unknown) => void) {
  if (param.uiHint?.kind === 'expression') {
    return (
      <ExpressionInput
        value={value as string}
        onChange={onChange}
        inputTypes={...}  // Get from block inputs
      />
    );
  }

  // ... existing param controls
}
```

### Task 3: End-to-End Integration Tests

**File:** `src/blocks/__tests__/expression-integration.test.ts`

**Purpose:** Validate full stack from UI → block → DSL → IR → runtime.

**Implementation:**

```typescript
import { compilePatch } from '../../compiler';
import { createRuntime } from '../../runtime';
import { signalType } from '../../core/canonical-types';

describe('Expression Integration', () => {
  test('expression compiles and executes', () => {
    // Create patch with Expression block
    const patch = {
      blocks: [
        {
          id: 'phase',
          type: 'PhaseA',
          config: {},
        },
        {
          id: 'expr',
          type: 'Expression',
          config: { expression: 'sin(a * 2)' },
        }
      ],
      edges: [
        {
          from: { blockId: 'phase', portId: 'out' },
          to: { blockId: 'expr', portId: 'a' }
        }
      ]
    };

    // Compile patch
    const compiled = compilePatch(patch);
    expect(compiled.ok).toBe(true);

    if (!compiled.ok) return;

    // Create runtime
    const runtime = createRuntime(compiled.value);

    // Tick at t=0 (phase=0)
    runtime.tick(0);

    // Get expression output
    const exprBlock = patch.blocks.find(b => b.id === 'expr')!;
    const outputSlot = ...; // Get slot from compiled IR
    const value = runtime.readSlot(outputSlot);

    // sin(0 * 2) = sin(0) = 0
    expect(value).toBeCloseTo(0, 5);

    // Tick at t=250 (phase=0.25)
    runtime.tick(250);
    const value2 = runtime.readSlot(outputSlot);

    // sin(0.25 * 2 * 2π) = sin(π) ≈ 0
    expect(value2).toBeCloseTo(0, 2);
  });

  test('multiple inputs', () => {
    const patch = {
      blocks: [
        { id: 'a', type: 'Const', config: { value: 3 } },
        { id: 'b', type: 'Const', config: { value: 4 } },
        { id: 'expr', type: 'Expression', config: { expression: 'sqrt(a*a + b*b)' } }
      ],
      edges: [
        { from: { blockId: 'a', portId: 'out' }, to: { blockId: 'expr', portId: 'a' } },
        { from: { blockId: 'b', portId: 'out' }, to: { blockId: 'expr', portId: 'b' } }
      ]
    };

    const compiled = compilePatch(patch);
    expect(compiled.ok).toBe(true);

    const runtime = createRuntime(compiled.value!);
    runtime.tick(0);

    const outputSlot = ...;
    const value = runtime.readSlot(outputSlot);

    // sqrt(3^2 + 4^2) = sqrt(9 + 16) = sqrt(25) = 5
    expect(value).toBeCloseTo(5, 5);
  });

  test('syntax error', () => {
    const patch = {
      blocks: [
        { id: 'expr', type: 'Expression', config: { expression: 'sin(' } }
      ],
      edges: []
    };

    const compiled = compilePatch(patch);
    expect(compiled.ok).toBe(false);
    expect(compiled.errors[0].code).toMatch(/syntax/i);
  });

  test('type error', () => {
    const patch = {
      blocks: [
        { id: 'phase1', type: 'PhaseA' },
        { id: 'phase2', type: 'PhaseB' },
        { id: 'expr', type: 'Expression', config: { expression: 'a + b' } }  // phase + phase
      ],
      edges: [
        { from: { blockId: 'phase1', portId: 'out' }, to: { blockId: 'expr', portId: 'a' } },
        { from: { blockId: 'phase2', portId: 'out' }, to: { blockId: 'expr', portId: 'b' } }
      ]
    };

    const compiled = compilePatch(patch);
    expect(compiled.ok).toBe(false);
    expect(compiled.errors[0].code).toMatch(/type/i);
  });
});
```

### Task 4: User Documentation

**File:** `docs/user/expression-block.md`

**Content:**

```markdown
# Expression Block

The Expression block lets you type mathematical expressions directly instead of wiring multiple blocks together. Perfect for quick calculations and prototyping.

## Quick Start

1. Add an Expression block to your patch
2. In the block inspector, type an expression like `phase * 2`
3. Wire the `phase` input to a phase source
4. Done! The output will be the expression result

## Syntax

### Arithmetic Operators

- `+` - Addition
- `-` - Subtraction
- `*` - Multiplication
- `/` - Division
- `%` - Modulo (remainder)

### Comparison Operators

- `<`, `>`, `<=`, `>=` - Less than, greater than, etc.
- `==`, `!=` - Equal, not equal

### Logic Operators

- `&&` - AND
- `||` - OR
- `!` - NOT

### Ternary Operator

`condition ? value_if_true : value_if_false`

Example: `x > 0.5 ? 1 : 0` (threshold at 0.5)

### Functions

**Math:**
- `sin(x)`, `cos(x)`, `tan(x)`
- `sqrt(x)`, `abs(x)`
- `floor(x)`, `ceil(x)`, `round(x)`

**Interpolation:**
- `mix(a, b, t)` - Blend between a and b (t=0→a, t=1→b)
- `lerp(a, b, t)` - Same as mix
- `smoothstep(edge0, edge1, x)` - Smooth interpolation
- `clamp(x, min, max)` - Limit x to [min, max]

**Other:**
- `min(a, b)`, `max(a, b)`
- `wrap(x)` - Wrap to [0, 1]
- `fract(x)` - Fractional part

## Examples

### Simple Math

```
phase * 2
```
Double the phase.

### Oscillation

```
sin(phase * 2)
```
Sine wave at 2x frequency.

### Threshold

```
x > 0.5 ? 1 : 0
```
Output 1 if x > 0.5, otherwise 0.

### Blend

```
mix(a, b, phase)
```
Blend between a and b over time.

### Pythagorean Theorem

```
sqrt(x*x + y*y)
```
Distance from origin.

### Smoothstep

```
smoothstep(0, 1, phase)
```
Smooth transition from 0 to 1.

### Complex Expression

```
sin(phase * 3.14 * 2) * 0.5 + 0.5
```
Sine wave remapped to [0, 1].

## Troubleshooting

### "Syntax error: Expected expression after '+'"

You have incomplete syntax. Common causes:
- Missing closing parenthesis: `sin(x` → `sin(x)`
- Operator without operand: `a +` → `a + b`
- Empty expression

### "Type error: Cannot add phase + phase"

You're trying an invalid operation. Phase values have special rules:
- `phase + phase` → ERROR (use `phase + float` for offset)
- `phase * phase` → ERROR (use `phase * float` for scale)

### "Undefined input 'x'"

Your expression references an input that isn't connected. Either:
- Connect the input
- Use a different identifier that matches your inputs

## Tips

- Use parentheses to control order: `(a + b) * c` vs `a + (b * c)`
- Input names match block input ports (a, b, c, etc.)
- Expression validation happens as you type
- Errors show position and helpful messages

## Advanced

For full grammar and function reference, see [Expression DSL Grammar](../../src/expr/GRAMMAR.md) and [Function Catalog](../../src/expr/FUNCTIONS.md).
```

### Task 5: Manual Testing Checklist

**File:** `docs/testing/expression-block-manual-test.md`

**Checklist:**

```markdown
# Expression Block Manual Test Checklist

## Setup

- [ ] Build app: `npm run dev`
- [ ] Open browser to localhost

## Block Library

- [ ] Open block library/palette
- [ ] Find "Expression" block under "signal" category
- [ ] Block has correct icon and label

## Add Block

- [ ] Drag Expression block onto canvas
- [ ] Block appears on canvas
- [ ] Block has inputs (a, b, c) and output (out)

## Block Inspector

- [ ] Select Expression block
- [ ] Inspector shows "Expression" parameter
- [ ] Parameter shows multiline text input
- [ ] Placeholder text shows example

## Simple Expression

- [ ] Type: `a * 2`
- [ ] No error shown
- [ ] Add Const block, set value to 5
- [ ] Wire Const → Expression input 'a'
- [ ] Run patch
- [ ] Expression output = 10

## Function Call

- [ ] Type: `sin(a)`
- [ ] No error shown
- [ ] Wire PhaseA → Expression input 'a'
- [ ] Run patch
- [ ] Output oscillates

## Syntax Error

- [ ] Type: `sin(`
- [ ] Error appears in inspector
- [ ] Error message helpful: "Expected expression"
- [ ] Fix: `sin(a)`
- [ ] Error disappears

## Type Error

- [ ] Wire PhaseA → input 'a'
- [ ] Wire PhaseB → input 'b'
- [ ] Type: `a + b`
- [ ] Error appears: "Cannot add phase + phase"
- [ ] Fix: `a + 0.5` or `mix(a, b, 0.5)`
- [ ] Error disappears

## Complex Expression

- [ ] Type: `sin(a * 2) * 0.5 + 0.5`
- [ ] No error
- [ ] Run patch
- [ ] Output correct

## Edge Cases

- [ ] Empty expression → no error (or helpful message)
- [ ] Very long expression (100+ chars) → handles gracefully
- [ ] Expression with whitespace → works
- [ ] Expression with newlines → works

## Pass Criteria

- [ ] All checks pass
- [ ] No console errors
- [ ] Expression block usable by non-technical artist
```

## Success Criteria

This integration sprint succeeds when:

1. **Expression block works:**
   - Can add to patch
   - Can type expressions
   - Compiles to IR
   - Executes correctly

2. **UI is functional:**
   - Expression input shows in inspector
   - Validation works
   - Errors are helpful
   - Performance acceptable

3. **Tests pass:**
   - Unit tests (block lowering)
   - Integration tests (end-to-end)
   - Manual testing checklist

4. **Documentation complete:**
   - User guide written
   - Examples provided
   - Troubleshooting guide

5. **Ready for users:**
   - Feature complete for v1
   - No blocking bugs
   - UX acceptable

## Files to Create/Modify

**Create:**
1. `src/blocks/expression-block.ts` (~100 LOC)
2. `src/ui/components/params/ExpressionInput.tsx` (~80 LOC)
3. `src/blocks/__tests__/expression-block.test.ts` (~100 LOC)
4. `src/blocks/__tests__/expression-integration.test.ts` (~150 LOC)
5. `docs/user/expression-block.md` (documentation)
6. `docs/testing/expression-block-manual-test.md` (test checklist)

**Modify:**
7. `src/ui/components/inspector/ParamControl.tsx` (add expression case)

**Total New Code:** ~430 LOC

## Constraints

**From CLAUDE.md:**
- Expression block is just a thin wrapper (keeps DSL isolated)
- All complexity in src/expr module (completed in previous sprint)
- Block uses public API only (compileExpression function)

**UX Constraints:**
- Errors must be understandable by artists (not developers)
- Validation should not lag (debounce if needed)
- Expression input should feel like normal text editing
