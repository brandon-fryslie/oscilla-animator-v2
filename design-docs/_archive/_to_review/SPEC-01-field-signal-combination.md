# Spec: Field-Signal Combination IR Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Blocks:** P1 (Compiler default source handling), P2 (Remove legacy params)

---

## Problem Statement

Several field operations cannot be lowered to IR because they require combining **fields** (per-element values) with **signals** (time-varying scalars) in ways the current IR doesn't support.

### Affected Blocks

| Block | Pattern Needed | Current Status |
|-------|----------------|----------------|
| `JitterFieldVec2` | field + signal → per-element vec2 with trig | Throws error in IR mode |
| `FieldMapVec2` | field + signal params → transformed vec2 | Throws error in IR mode |
| `FieldHueGradient` | indexed field + signals → colors | Throws error in IR mode |
| `FieldZipSignal` | field + signal → field via binary op | **Works** (broadcasts then zips) |
| `FieldFromExpression` | indexed + signal + JS eval | **Cannot be IR** (dynamic code) |

---

## Backlog Checklist

- [ ] Add `FieldExprMapIndexed` node + evaluator (indexed mapping with i/n).
- [ ] Add `FieldExprZipSig` node + evaluator (field + signals with n-ary kernel).
- [ ] Extend kernel library for indexed/field-signal kernels (jitter, gradients, vec2 transforms).
- [ ] Decide vec2 strategy (kernel vs opcode) and implement chosen path.
- [ ] Add IR lowering + runtime tests for JitterFieldVec2, FieldMapVec2, FieldHueGradient.

---

## Current IR Architecture

### Existing FieldExprIR Nodes

```typescript
// What we have:
FieldExprConst        // constant: pool[constId]
FieldExprBroadcastSig // broadcast: signal → field (repeat value)
FieldExprMap          // unary: fn(field[i]) for each i
FieldExprZip          // binary: fn(a[i], b[i]) for each i
FieldExprSelect       // conditional: cond[i] ? t[i] : f[i]
FieldExprTransform    // chain: apply transform chain
FieldExprBusCombine   // aggregate: combine field publishers
```

### The Gap

`FieldZipSignal` works around the gap by:
1. Broadcasting signal to field: `broadcastSigToField(sig) → Field<number>`
2. Zipping two fields: `fieldZip(field, broadcastField) → Field<number>`

This works for simple binary ops (add, mul, min, max) but NOT for:
- Operations requiring element index (`i`, `n`)
- Operations requiring multiple signals evaluated together
- Complex multi-step computations (trig, vec2 transforms)

---

## Proposed Primitives

### 1. FieldExprMapIndexed

**Purpose:** Map with element index/count access for indexed patterns.

```typescript
interface FieldExprMapIndexed {
  kind: "mapIndexed";
  type: TypeDesc;
  domainSlot: ValueSlot;  // domain for n
  fn: PureFnRef;          // fn(i, n) → T
  signals?: SigExprId[];  // optional signals to evaluate
}
```

**Runtime semantics:**
```typescript
function evalMapIndexed(node, env) {
  const n = env.domainCount(node.domainSlot);
  const sigValues = node.signals?.map(s => evalSig(s, env)) ?? [];
  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = evalFn(node.fn, i, n, ...sigValues);
  }
  return result;
}
```

**Enables:**
- `FieldHueGradient`: `hsl(hueOffset + (i/n) * spread, sat, light)`
- Any indexed gradient/pattern generation

**Complexity:** Medium (new opcode calling convention with i,n)

---

### 2. FieldExprZipSig (Field-Signal Combination)

**Purpose:** Combine field with signal per-element with custom logic.

```typescript
interface FieldExprZipSig {
  kind: "zipSig";
  type: TypeDesc;
  field: FieldExprId;     // per-element input
  signals: SigExprId[];   // signals to evaluate once
  fn: PureFnRef;          // fn(field[i], sig1, sig2, ...) → T
}
```

**Runtime semantics:**
```typescript
function evalZipSig(node, env) {
  const fieldData = materialize(node.field, env);
  const sigValues = node.signals.map(s => evalSig(s, env));
  const result = new Array(fieldData.length);
  for (let i = 0; i < fieldData.length; i++) {
    result[i] = evalFn(node.fn, fieldData[i], ...sigValues);
  }
  return result;
}
```

**Why not just broadcast + zip?**
- Broadcast + zip only handles 2 inputs with binary ops
- JitterFieldVec2 needs: `fn(random[i], phase, amount, frequency)`
- FieldMapVec2 needs: `fn(vec[i], angle, centerX, centerY)`

**Enables:**
- `JitterFieldVec2`: Complex trig with multiple params
- Multi-signal field operations

**Complexity:** Medium-High (n-ary kernel calling)

---

### 3. Vec2 Field Opcodes

**Purpose:** Transform vec2 fields with signal-driven parameters.

```typescript
// New opcodes for vec2 operations
enum OpCode {
  // ... existing ...

  // Vec2 unary ops (on field)
  FieldVec2Negate,     // -v
  FieldVec2Normalize,  // v / |v|

  // Vec2 binary ops (field × field or field × signal)
  FieldVec2Add,
  FieldVec2Sub,
  FieldVec2Mul,   // component-wise
  FieldVec2Div,

  // Vec2 transform ops (field × signal params)
  FieldVec2Rotate,     // rotate(v, angle, center)
  FieldVec2Scale,      // scale(v, sx, sy, center)
  FieldVec2Translate,  // translate(v, dx, dy)
}
```

**Alternative approach:** Use `FieldExprZipSig` with composite kernels:
```typescript
// Instead of dedicated opcode:
fieldZipSig(
  vecField,
  [angleSignal, centerXSignal, centerYSignal],
  { kind: "kernel", name: "vec2Rotate" }
)
```

**Enables:**
- `FieldMapVec2`: All vec2 transformations
- Animated position transformations

**Complexity:** Low if using kernel approach, Medium if dedicated opcodes

---

### 4. Kernel Library Extension

Rather than many opcodes, extend the kernel library:

```typescript
// Kernels that take (field_value, ...signals) → result
const FIELD_KERNELS = {
  // Jitter pattern
  "jitterVec2": (rand: number, phase: number, amount: number, freq: number) => {
    const angle = rand * Math.PI * 2;
    const mag = Math.sin((phase * freq + rand) * Math.PI * 2) * amount;
    return { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
  },

  // Vec2 transforms
  "vec2Rotate": (v: Vec2, angle: number, cx: number, cy: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = v.x - cx;
    const dy = v.y - cy;
    return { x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos };
  },

  // Color generation
  "hslGradient": (i: number, n: number, offset: number, spread: number, sat: number, light: number) => {
    const hue = offset + (i / (n-1)) * spread * 360;
    return hslToRgb(hue, sat, light);
  },
};
```

**Complexity:** Low (just function registry)

---

## Recommended Implementation Path

### Phase 1: FieldExprZipSig (Minimum Viable)

1. Add `FieldExprZipSig` IR node type
2. Add runtime evaluation in Materializer
3. Add IRBuilder method: `fieldZipSig(field, signals, fn)`
4. Migrate `JitterFieldVec2` and `FieldMapVec2` to use it

**Result:** All vec2 field ops work in IR mode.

### Phase 2: FieldExprMapIndexed

1. Add `FieldExprMapIndexed` IR node type
2. Add runtime evaluation with i,n access
3. Add IRBuilder method: `fieldMapIndexed(domain, fn, signals?)`
4. Migrate `FieldHueGradient` to use it

**Result:** Indexed patterns work in IR mode.

### Phase 3: Remove Legacy Params

Once Phase 1+2 complete:
1. Verify all field ops work without params
2. Remove `params` from FieldExprMap, FieldExprZip
3. Remove `params` from FieldHandle types
4. Remove `readParamNumber()` from Materializer

**Result:** Clean IR without legacy params.

---

## Open Questions

1. **Kernel registry vs opcodes?**
   - Kernels: more flexible, easier to add, harder to optimize
   - Opcodes: faster, but more IR changes per operation

2. **Color string encoding in IR?**
   - Option A: Return packed int32 (RGBA), convert at render
   - Option B: Field<color> stays as string, IR emits string constants
   - Option C: Defer color ops to closure mode (pragmatic)

3. **Domain slot threading?**
   - MapIndexed needs domain count - where does it come from?
   - Option: Explicit domainSlot in node
   - Option: Infer from upstream field

---

## Appendix: Closure-Only Blocks

These blocks CANNOT be IR-compatible and should remain closure-mode:

| Block | Reason |
|-------|--------|
| `FieldFromExpression` | Dynamic JS evaluation (security boundary) |
| Future "scripted" blocks | Same reason |

This is acceptable - IR is for optimization, not 100% coverage.

---

## Summary

| Primitive | Enables | Complexity | Priority |
|-----------|---------|------------|----------|
| `FieldExprZipSig` | JitterVec2, FieldMapVec2 | Medium-High | P0 |
| `FieldExprMapIndexed` | FieldHueGradient | Medium | P1 |
| Kernel library | Clean separation | Low | P0 |
| Remove params | Clean up | Low | P2 (after above) |

**Estimated effort:** 2-3 focused sessions for Phase 1, 1-2 sessions for Phase 2.
