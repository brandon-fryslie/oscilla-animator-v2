# Implementation Context: Opcode Consolidation

Sprint: opcode-consolidation
Date: 2026-02-06

## Files to Modify

### Primary: ValueExprMaterializer.ts

**Location:** `src/runtime/ValueExprMaterializer.ts`
**Lines:** 400-447 (replace entire `evaluatePureFn` function)

**Before:**
```typescript
function evaluatePureFn(fn: PureFn, args: number[]): number {
  if (fn.kind === 'opcode') {
    switch (fn.opcode) {
      case 'add': return args[0] + args[1];
      case 'sub': return args[0] - args[1];
      // ... 24 more cases
      default: throw new Error(`Unknown opcode: ${fn.opcode}`);
    }
  } else if (fn.kind === 'kernel') {
    throw new Error(`Kernel functions not yet implemented: ${fn.name}`);
  } else if (fn.kind === 'expr') {
    throw new Error(`Expression evaluation not yet implemented: ${fn.expr}`);
  }
  throw new Error(`Unknown function kind: ${(fn as PureFn).kind}`);
}
```

**After:**
```typescript
function evaluatePureFn(fn: PureFn, args: number[]): number {
  switch (fn.kind) {
    case 'opcode':
      return applyOpcode(fn.opcode, args);
    case 'kernel':
      throw new Error(`Kernel functions not yet implemented: ${fn.name}`);
    case 'kernelResolved':
      throw new Error(`kernelResolved not yet implemented: ${fn.handle}`);
    case 'expr':
      throw new Error(`Expression evaluation not yet implemented: ${fn.expr}`);
    case 'composed': {
      let result = args[0];
      for (const op of fn.ops) {
        result = applyOpcode(op, [result]);
      }
      return result;
    }
    default: {
      const _exhaustive: never = fn;
      throw new Error(`Unknown function kind: ${(_exhaustive as PureFn).kind}`);
    }
  }
}
```

### Secondary: forbidden-patterns.test.ts

**Location:** `src/__tests__/forbidden-patterns.test.ts`
**Action:** Add test case

**Pattern to forbid:** Opcode switch cases in ValueExprMaterializer.ts

```typescript
describe('ValueExprMaterializer opcode enforcement', () => {
  it('should not contain direct opcode implementations', async () => {
    const content = await fs.readFile(
      path.join(srcDir, 'runtime/ValueExprMaterializer.ts'),
      'utf-8'
    );

    // These opcodes must be handled by OpcodeInterpreter, not inline
    const forbiddenPatterns = [
      /case\s+'add':/,
      /case\s+'sub':/,
      /case\s+'mul':/,
      /case\s+'div':/,
      /case\s+'sin':/,
      /case\s+'cos':/,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(content).not.toMatch(pattern);
    }
  });
});
```

## Reference Implementation

**SignalKernelLibrary.ts:41-75** shows the correct pattern:

```typescript
export function applyPureFn(fn: PureFn, values: number[]): number {
  switch (fn.kind) {
    case 'opcode':
      return applyOpcode(fn.opcode, values);  // <-- Delegation
    case 'kernel':
      return applySignalKernel(fn.name, values);
    case 'kernelResolved':
      throw new Error(...);
    case 'expr':
      throw new Error(...);
    case 'composed': {
      let result = values[0];
      for (const op of fn.ops) {
        result = applyOpcode(op, [result]);
      }
      return result;
    }
    default: {
      const _exhaustive: never = fn;
      throw new Error(...);
    }
  }
}
```

## Semantic Notes

### Variadic Operations

OpcodeInterpreter implements `add` and `mul` as variadic:
- `add`: `values.reduce((a, b) => a + b, 0)`
- `mul`: `values.reduce((a, b) => a * b, 1)`

ValueExprMaterializer currently uses binary:
- `add`: `args[0] + args[1]`
- `mul`: `args[0] * args[1]`

**Impact:** None. All kernel invocations pass exact arity. The variadic behavior only affects edge cases with >2 args, which don't exist in current code.

### Select Condition

OpcodeInterpreter: `values[0] > 0 ? values[1] : values[2]`
ValueExprMaterializer: `args[0] ? args[1] : args[2]`

**Impact:** Minor. Affects condition value exactly 0.0:
- Before: 0.0 is falsy → returns ifFalse
- After: 0.0 > 0 is false → returns ifFalse

Both return the same result for 0.0, so no behavioral change.

## Testing Strategy

1. Run full test suite (catches any regressions)
2. Check demos visually (golden-spiral uses many opcodes)
3. Forbidden-pattern test prevents regression
