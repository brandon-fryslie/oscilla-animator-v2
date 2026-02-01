# Sprint: opcode-unification - Per-Lane Opcode Dispatch (Q30 Option B)
Generated: 2026-02-01T09:36:00Z
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Unify block lowering so pure math always emits opcodes (never named field kernels), fix the latent runtime bug where field-path math throws `Unknown field kernel`, and add enforcement + tests.

## Scope
**Deliverables:**
1. Block lowering emits opcodes for all pure math (no signal/field branching for math ops)
2. Field-path math tests for all 7 blocks
3. Enforcement test preventing `fn.kind: 'kernel'` for arithmetic names
4. (Optional) Opcode hot-loop optimization — pre-resolved function table

## Work Items

### WI-1: Unify Block Lower Functions — Replace Named Field Kernels with Opcodes
**Confidence: HIGH**

**What**: Rewrite 7 block `lower()` functions to emit the same opcode-based PureFn regardless of input cardinality. The only cardinality-dependent logic is broadcast insertion when mixing signal + field inputs.

**Files to change:**
- `src/blocks/math-blocks.ts` — Add, Subtract, Multiply, Divide, Modulo (5 blocks)
- `src/blocks/field-operations-blocks.ts` — FieldSin, FieldCos (2 blocks)

**Pattern (before → after):**

Before (Add block, lines 44-102):
```typescript
lower: ({ ctx, inputsById }) => {
  const a = inputsById.a;
  const b = inputsById.b;
  const aCard = requireInst(a.type.extent.cardinality, 'cardinality');
  const bCard = requireInst(b.type.extent.cardinality, 'cardinality');
  const isAField = aCard.kind === 'many';
  const isBField = bCard.kind === 'many';

  // Signal path
  if (!isAField && !isBField) {
    const addFn = ctx.b.opcode(OpCode.Add);
    const sigId = ctx.b.kernelZip([a.id, b.id], addFn, canonicalType(FLOAT));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { id: sigId, slot, type: outType, stride: ... } } };
  }

  // Field path
  if (isAField || isBField) {
    // ... broadcast logic ...
    const addFn = ctx.b.kernel('fieldAdd');  // BUG: kernel doesn't exist
    const fieldId = ctx.b.kernelZip([aField, bField], addFn, outType);
    // ...
  }
}
```

After:
```typescript
lower: ({ ctx, inputsById }) => {
  const a = inputsById.a;
  const b = inputsById.b;
  const outType = ctx.outTypes[0];
  const addFn = ctx.b.opcode(OpCode.Add);  // ALWAYS opcode

  // If either input is field-extent, broadcast the other
  const aCard = requireInst(a.type.extent.cardinality, 'cardinality');
  const bCard = requireInst(b.type.extent.cardinality, 'cardinality');
  const isAField = aCard.kind === 'many';
  const isBField = bCard.kind === 'many';

  let aId = a.id;
  let bId = b.id;
  if (isAField && !isBField) {
    bId = ctx.b.broadcast(b.id, outType);
  } else if (!isAField && isBField) {
    aId = ctx.b.broadcast(a.id, outType);
  }

  const resultId = ctx.b.kernelZip([aId, bId], addFn, outType);
  const slot = ctx.b.allocSlot();
  const isField = isAField || isBField;

  return {
    outputsById: {
      out: { id: resultId, slot, type: outType, stride: strideOf(outType.payload) },
    },
    ...(isField ? { instanceContext: ctx.inferredInstance } : {}),
  };
}
```

**Key change**: Single code path. Opcode is always `ctx.b.opcode(...)`. Broadcast handles promotion. No `ctx.b.kernel('field...')` anywhere.

**Acceptance Criteria:**
- [ ] All 7 blocks emit `fn.kind: 'opcode'` for their math operation
- [ ] No `ctx.b.kernel('fieldAdd')` / `'fieldSubtract'` / etc. anywhere in block files
- [ ] Broadcast is inserted when mixing signal + field inputs
- [ ] Signal-only inputs still produce signal-extent output (no unnecessary broadcast)
- [ ] `npm run typecheck` passes
- [ ] All existing tests pass

---

### WI-2: Add Field-Path Tests for Math Blocks
**Confidence: HIGH**

**What**: Add integration tests that compile and execute graphs with field-cardinality inputs through Add, Subtract, Multiply, Divide, Modulo, Sin, Cos blocks. These tests currently don't exist, which is why the `fieldAdd` bug was latent.

**Tests to add:**
1. Pure field + field → field (both inputs are field-extent)
2. Mixed signal + field → field (broadcast path)
3. Field through unary op (Sin, Cos on field input)

**File**: `src/blocks/__tests__/math-field-paths.test.ts` (new file)

**Acceptance Criteria:**
- [ ] Test for each of the 7 blocks with field-cardinality inputs
- [ ] Tests verify actual buffer values (not just "compiles without error")
- [ ] Mixed signal+field test verifies broadcast correctness
- [ ] Tests run in < 1s

---

### WI-3: Add Enforcement Test — No Arithmetic Kernel Names
**Confidence: HIGH**

**What**: Add a test that scans all block definitions and verifies no `lower()` output contains `fn.kind: 'kernel'` with a name in the arithmetic denylist.

**Denylist**: `fieldAdd`, `fieldSubtract`, `fieldMultiply`, `fieldDivide`, `fieldModulo`, `fieldSin`, `fieldCos`, `fieldTan`, `fieldAbs`, `fieldNeg`, `fieldFloor`, `fieldCeil`, `fieldRound`, `fieldFract`, `fieldSqrt`, `fieldExp`, `fieldLog`, `fieldSign`, `fieldWrap01`, `fieldClamp`, `fieldLerp`, `fieldPow`, `fieldMin`, `fieldMax`

**Implementation**: Compile a test graph with each block, inspect the emitted ValueExpr nodes, assert none contain a kernel PureFn with a denied name.

**Alternative (lighter)**: Static grep-based test that scans `src/blocks/*.ts` for `ctx.b.kernel('field` and fails if any match.

**File**: `src/blocks/__tests__/no-arithmetic-kernels.test.ts` (new file) or addition to existing invariant tests

**Acceptance Criteria:**
- [ ] Test fails if any block emits a denied kernel name
- [ ] Test passes with the WI-1 changes applied
- [ ] Denylist is documented and extensible

---

### WI-4: (Optional) Pre-Resolve Opcode Functions for Hot Loop Performance
**Confidence: HIGH**

**What**: The current per-lane loop calls `applyOpcode(op, values)` which does a string switch on every lane. Pre-resolve the opcode to a function pointer once and call it directly in the loop.

**Current hot path** (in `applyZip`):
```typescript
for (let i = 0; i < count; i++) {
  for (let c = 0; c < stride; c++) {
    const idx = i * stride + c;
    const values = inputs.map(buf => buf[idx]);
    out[idx] = applyOpcode(op, values);  // string switch per lane
  }
}
```

**Optimized** (conceptual):
```typescript
const opFn = resolveOpcode(op);  // resolve once
for (let i = 0; i < count; i++) {
  for (let c = 0; c < stride; c++) {
    const idx = i * stride + c;
    out[idx] = opFn(inputs[0][idx], inputs[1][idx]);  // direct call, no allocation
  }
}
```

**Note**: This is a performance optimization, not a correctness fix. Defer if scope needs trimming.

**Acceptance Criteria:**
- [ ] No per-lane array allocations in inner loop
- [ ] No per-lane string switch in inner loop
- [ ] Benchmark shows measurable improvement for field operations
- [ ] All tests still pass

## Dependencies
- WI-1 must complete before WI-2 and WI-3 (tests validate the fix)
- WI-4 is independent and optional

**Execution order**: WI-1 → WI-2 + WI-3 (parallel) → WI-4 (optional)

## Risks
- **Broadcast type mismatch**: When a signal is broadcast to field-extent, the broadcast node's output type must match the field type. The existing `ctx.b.broadcast()` handles this, but we need to verify the type construction is correct for each block.
- **instanceContext propagation**: Field paths set `instanceContext` on the result. Must ensure this is still set when field inputs are detected.
