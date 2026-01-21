# Sprint: add-opcodes - Add Missing Opcodes to OpcodeInterpreter

**Generated:** 2026-01-21T03:55:17Z
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Add all missing scalar math opcodes (floor, ceil, round, fract, sqrt, exp, log, sign, pow) to OpcodeInterpreter.ts so it becomes the complete authority for scalar numeric operations.

## Scope

**Deliverables:**
1. Add 8 unary opcodes: floor, ceil, round, fract, sqrt, exp, log, sign
2. Add 1 binary opcode: pow
3. Add strict arity validation helper function
4. Update applyUnaryOp and applyNaryOp with arity enforcement

## Work Items

### P0: Add unary opcodes to applyUnaryOp

**File:** `src/runtime/OpcodeInterpreter.ts`

**Acceptance Criteria:**
- [ ] Add `floor` case at line ~55 (before default): `return Math.floor(x);`
- [ ] Add `ceil` case: `return Math.ceil(x);`
- [ ] Add `round` case: `return Math.round(x);`
- [ ] Add `fract` case: `return x - Math.floor(x);`
- [ ] Add `sqrt` case: `return Math.sqrt(x);`
- [ ] Add `exp` case: `return Math.exp(x);`
- [ ] Add `log` case: `return Math.log(x);`
- [ ] Add `sign` case: `return Math.sign(x);`

**Technical Notes - Line-by-Line Instructions:**

```typescript
// File: src/runtime/OpcodeInterpreter.ts
// Location: Inside applyUnaryOp switch statement (lines 37-58)
// Insert BEFORE the default case (line 57)

// After line 55 (case 'wrap01':), add:

    case 'floor':
      return Math.floor(x);
    case 'ceil':
      return Math.ceil(x);
    case 'round':
      return Math.round(x);
    case 'fract':
      return x - Math.floor(x);
    case 'sqrt':
      return Math.sqrt(x);
    case 'exp':
      return Math.exp(x);
    case 'log':
      return Math.log(x);
    case 'sign':
      return Math.sign(x);
```

### P1: Add binary pow opcode to applyNaryOp

**File:** `src/runtime/OpcodeInterpreter.ts`

**Acceptance Criteria:**
- [ ] Add `pow` case in applyNaryOp that requires exactly 2 arguments
- [ ] Throw error if arity doesn't match

**Technical Notes - Line-by-Line Instructions:**

```typescript
// File: src/runtime/OpcodeInterpreter.ts
// Location: Inside applyNaryOp switch statement (lines 68-112)
// Insert BEFORE the hash case (line 92)

// After line 91 (lerp case ends), add:

    case 'pow':
      if (values.length !== 2) {
        throw new Error(`OpCode 'pow' requires exactly 2 arguments, got ${values.length}`);
      }
      return Math.pow(values[0], values[1]);
```

### P2: Add arity validation helper (optional enhancement)

**File:** `src/runtime/OpcodeInterpreter.ts`

**Acceptance Criteria:**
- [ ] Add helper function `expectArity(op: string, got: number, expected: number): void`
- [ ] Use it for fixed-arity operations in applyNaryOp

**Technical Notes:**

```typescript
// Add after line 27 (end of applyOpcode function)

/**
 * Validate opcode arity - throws if mismatch
 */
function expectArity(op: string, got: number, expected: number): void {
  if (got !== expected) {
    throw new Error(`OpCode '${op}' requires exactly ${expected} argument(s), got ${got}`);
  }
}
```

### P3: Update header comment with complete opcode list

**File:** `src/runtime/OpcodeInterpreter.ts`

**Acceptance Criteria:**
- [ ] Update header comment (lines 1-12) to list all supported opcodes by arity

**Technical Notes:**

```typescript
// Replace lines 1-12 with:

/**
 * Opcode Interpreter - SINGLE ENFORCER
 *
 * Unified opcode evaluation for all runtime modules.
 * This is the ONLY place that defines scalar numeric operations.
 *
 * Adheres to architectural law: SINGLE ENFORCER
 *
 * OPCODE REFERENCE:
 * ─────────────────────────────────────────────────────────────
 * UNARY (exactly 1 arg):
 *   neg, abs, sin, cos, tan, wrap01,
 *   floor, ceil, round, fract, sqrt, exp, log, sign
 *
 * BINARY (exactly 2 args):
 *   sub, div, mod, pow, hash
 *
 * TERNARY (exactly 3 args):
 *   clamp, lerp
 *
 * VARIADIC (1+ args):
 *   add, mul, min, max
 * ─────────────────────────────────────────────────────────────
 *
 * IMPORTANT: sin/cos/tan operate on RADIANS, not phase.
 * For phase-based oscillators, use SignalEvaluator kernels.
 */
```

## Dependencies

None

## Risks

| Risk | Mitigation |
|------|------------|
| Existing code may call applyOpcode with wrong arity | New strict arity only for new ops; legacy behavior preserved |
