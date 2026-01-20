# Expression DSL Built-in Functions

**Status:** FROZEN
**Last Updated:** 2026-01-20
**Change Process:** Function additions require spec update

## Overview

This document catalogs all built-in functions available in the Expression DSL. Each function specifies its signature, type rules, and mapping to IR primitives (OpCodes or IRBuilder methods).

## Function Categories

### Math (Trigonometric)

#### `sin(x: float) → float`

**Description:** Sine of x (x in radians)

**IR Mapping:** `OpCode.Sin`

**Examples:**
```
sin(0)          // → 0
sin(phase)      // Oscillating sine wave
sin(phase * 2)  // Double frequency
```

**Type Rules:**
- Input must be numeric (float, int, phase)
- int → float coercion applied
- phase is allowed (radians interpretation)
- Returns float

---

#### `cos(x: float) → float`

**Description:** Cosine of x (x in radians)

**IR Mapping:** `OpCode.Cos`

**Examples:**
```
cos(0)          // → 1
cos(phase)      // Oscillating cosine wave
cos(phase + 1.57)  // Phase-shifted sine (≈90° shift)
```

**Type Rules:**
- Input must be numeric (float, int, phase)
- int → float coercion applied
- phase is allowed (radians interpretation)
- Returns float

---

#### `tan(x: float) → float`

**Description:** Tangent of x (x in radians)

**IR Mapping:** `OpCode.Tan`

**Examples:**
```
tan(0)          // → 0
tan(phase)      // Oscillating tangent wave
```

**Type Rules:**
- Input must be numeric (float, int, phase)
- int → float coercion applied
- phase is allowed (radians interpretation)
- Returns float

**Note:** Undefined at odd multiples of π/2

---

### Math (Unary)

#### `abs(x: T) → T`

**Description:** Absolute value of x

**IR Mapping:** `OpCode.Abs`

**Examples:**
```
abs(-5)         // → 5
abs(x - 0.5)    // Distance from 0.5
```

**Type Rules:**
- Polymorphic: works on int or float
- Returns same type as input
- int input → int output
- float input → float output

---

#### `sqrt(x: float) → float`

**Description:** Square root of x

**IR Mapping:** IR builder synthesis: `x ** 0.5` OR OpCode if available

**Examples:**
```
sqrt(4)         // → 2.0
sqrt(x * x + y * y)  // Euclidean distance
```

**Type Rules:**
- Input must be numeric (float, int)
- int → float coercion applied
- Returns float
- Undefined for negative x (implementation may return NaN or error)

---

#### `floor(x: float) → int`

**Description:** Largest integer ≤ x

**IR Mapping:** `OpCode.Floor`

**Examples:**
```
floor(3.7)      // → 3
floor(-2.3)     // → -3
floor(phase * 10)  // Quantize to integers
```

**Type Rules:**
- Input must be numeric (float, phase)
- Returns int
- phase → float coercion before floor

---

#### `ceil(x: float) → int`

**Description:** Smallest integer ≥ x

**IR Mapping:** `OpCode.Ceil`

**Examples:**
```
ceil(3.2)       // → 4
ceil(-2.7)      // → -2
```

**Type Rules:**
- Input must be numeric (float, phase)
- Returns int
- phase → float coercion before ceil

---

#### `round(x: float) → int`

**Description:** Nearest integer (ties round to even)

**IR Mapping:** `OpCode.Round`

**Examples:**
```
round(3.5)      // → 4
round(4.5)      // → 4 (banker's rounding)
round(-2.5)     // → -2
```

**Type Rules:**
- Input must be numeric (float, phase)
- Returns int
- phase → float coercion before round

---

### Math (Binary)

#### `min(a: T, b: T) → T`

**Description:** Minimum of two values

**IR Mapping:** `OpCode.Min`

**Examples:**
```
min(5, 10)      // → 5
min(x, 0)       // Clamp to non-positive
```

**Type Rules:**
- Polymorphic: works on int or float
- Both arguments must have same type (after coercion)
- Returns same type as inputs
- int & int → int
- float & float → float
- int & float → float (int coerced to float)

---

#### `max(a: T, b: T) → T`

**Description:** Maximum of two values

**IR Mapping:** `OpCode.Max`

**Examples:**
```
max(5, 10)      // → 10
max(x, 0)       // Clamp to non-negative
```

**Type Rules:**
- Polymorphic: works on int or float
- Both arguments must have same type (after coercion)
- Returns same type as inputs
- int & int → int
- float & float → float
- int & float → float (int coerced to float)

---

### Interpolation

#### `lerp(a: float, b: float, t: float) → float`

**Description:** Linear interpolation: `(1 - t) * a + t * b`

**IR Mapping:** `OpCode.Lerp` OR IR builder synthesis: `(1 - t) * a + t * b`

**Examples:**
```
lerp(0, 10, 0.5)    // → 5.0 (midpoint)
lerp(a, b, phase)   // Morph from a to b
```

**Type Rules:**
- All arguments must be numeric (float, int)
- int → float coercion applied
- Returns float

**Note:** `t` is not clamped. Use `clamp(t, 0, 1)` if needed.

---

#### `mix(a: float, b: float, t: float) → float`

**Description:** Alias for `lerp` (GLSL convention)

**IR Mapping:** Same as `lerp`

**Examples:**
```
mix(0, 1, 0.25)     // → 0.25
mix(a, b, phase)    // Same as lerp(a, b, phase)
```

**Type Rules:**
- Same as `lerp`

---

#### `smoothstep(edge0: float, edge1: float, x: float) → float`

**Description:** Smooth Hermite interpolation between edge0 and edge1

Returns:
- 0 if `x ≤ edge0`
- 1 if `x ≥ edge1`
- Smooth curve (3t² - 2t³) between

**IR Mapping:** `OpCode.Smoothstep` OR IR builder synthesis

**Examples:**
```
smoothstep(0, 1, 0.5)   // → 0.5 (but smooth curve, not linear)
smoothstep(0, 1, phase) // Ease in/out
```

**Type Rules:**
- All arguments must be numeric (float, int, phase)
- int → float coercion applied
- Returns float

**Implementation:**
```
t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
return t * t * (3 - 2 * t)
```

---

#### `clamp(x: float, min: float, max: float) → float`

**Description:** Constrain x to [min, max]

Returns:
- `min` if `x < min`
- `max` if `x > max`
- `x` otherwise

**IR Mapping:** `OpCode.Clamp`

**Examples:**
```
clamp(5, 0, 10)     // → 5
clamp(-5, 0, 10)    // → 0
clamp(15, 0, 10)    // → 10
clamp(phase, 0, 1)  // Ensure unit range
```

**Type Rules:**
- All arguments must be numeric (float, int, phase)
- int → float coercion applied
- Returns float

---

### Phase Operations

#### `wrap(x: float) → phase`

**Description:** Wrap x to [0, 1) range (fractional part)

**IR Mapping:** `OpCode.Wrap01` (equivalent to `fract`)

**Examples:**
```
wrap(0.7)       // → 0.7
wrap(1.3)       // → 0.3
wrap(-0.4)      // → 0.6
wrap(phase + offset)  // Phase shift with wrap
```

**Type Rules:**
- Input must be numeric (float, int, phase)
- int → float coercion applied
- Returns phase type (semantic: wrapped to [0, 1))

**Implementation:** `x - floor(x)`

---

#### `fract(x: float) → float`

**Description:** Fractional part of x (same as wrap but returns float)

**IR Mapping:** `OpCode.Wrap01` (same as wrap)

**Examples:**
```
fract(3.7)      // → 0.7
fract(-2.3)     // → 0.7
```

**Type Rules:**
- Input must be numeric (float, int, phase)
- int → float coercion applied
- Returns float (not phase type)

**Note:** Mathematically equivalent to `wrap`, but type semantics differ.

---

## Function Call Semantics

### Evaluation Order

Arguments are evaluated left-to-right before function call:
```
fn(a(), b(), c())
// Order: a(), then b(), then c(), then fn
```

### Purity

All functions are pure (no side effects):
- Same inputs always produce same output
- No state modification
- No I/O

### Arity Checking

Functions must be called with correct number of arguments:
- `sin(x, y)` → ERROR: sin expects 1 argument, got 2
- `min(x)` → ERROR: min expects 2 arguments, got 1
- `clamp(x, min)` → ERROR: clamp expects 3 arguments, got 2

### Undefined Behavior

Some functions have undefined behavior for certain inputs:
- `sqrt(x)` for x < 0 → NaN or error (implementation-defined)
- `tan(π/2)` → ±∞ or error
- Division by zero in synthesized functions → error

## Type Coercion Rules

See `.agent_planning/expression-dsl/TYPE-RULES.md` for full type system.

**Summary:**
- int → float: Allowed (safe)
- phase → float: Allowed when passed to float-expecting function
- float → int: NOT allowed (use floor/ceil/round explicitly)
- float → phase: NOT allowed (use wrap explicitly)

## IR Mapping Strategy

### Direct OpCode Mapping

Most functions map 1:1 to OpCodes:
```typescript
// Example: sin(x)
const sinFn = ctx.b.opcode(OpCode.Sin);
const result = ctx.b.sigMap(xSigId, sinFn, signalType('float'));
```

### Synthesized Functions

Some functions are synthesized from primitives:
```typescript
// Example: lerp(a, b, t) = (1 - t) * a + t * b
const one = ctx.b.sigConst(1, signalType('float'));
const oneMinusT = ctx.b.sigZip([one, t], ctx.b.opcode(OpCode.Sub), signalType('float'));
const term1 = ctx.b.sigZip([oneMinusT, a], ctx.b.opcode(OpCode.Mul), signalType('float'));
const term2 = ctx.b.sigZip([t, b], ctx.b.opcode(OpCode.Mul), signalType('float'));
const result = ctx.b.sigZip([term1, term2], ctx.b.opcode(OpCode.Add), signalType('float'));
```

### Missing OpCodes

If a function needs an OpCode that doesn't exist:
1. Check if it can be synthesized from existing OpCodes
2. If not, flag for future work (add OpCode in separate sprint)
3. For research sprint: document the gap

**Current Status:** All functions above can be implemented with existing OpCodes or synthesis.

## Future Extensions

### Vec2 Functions (Deferred)

Future support for vector operations:
- `length(v: vec2) → float`
- `normalize(v: vec2) → vec2`
- `dot(a: vec2, b: vec2) → float`

Requires:
- Vec2 type support in type system
- Vec2 OpCodes or component-wise synthesis
- Vec2 literal syntax in grammar

### Color Functions (Deferred)

Future support for color operations:
- `hsl(h: float, s: float, l: float) → color`
- `rgb(r: float, g: float, b: float) → color`

Requires:
- Color type support in type system
- Color OpCodes
- Color literal syntax in grammar

### User-Defined Functions (Future)

Future consideration for custom functions:
```
// Hypothetical syntax
def ease(x) = smoothstep(0, 1, x)
```

Requires:
- Function definition syntax
- Namespace management
- Recursion guards

**Not in scope for v1.**

## Verification

### IR Mapping Verification

All functions verified to have IR mappings:

| Function | OpCode/Synthesis | Status |
|----------|------------------|--------|
| sin | OpCode.Sin | ✅ Exists |
| cos | OpCode.Cos | ✅ Exists |
| tan | OpCode.Tan | ✅ Exists |
| abs | OpCode.Abs | ✅ Exists |
| sqrt | Synthesis OR OpCode | ✅ Can synthesize |
| floor | OpCode.Floor | ✅ Exists |
| ceil | OpCode.Ceil | ✅ Exists |
| round | OpCode.Round | ✅ Exists |
| min | OpCode.Min | ✅ Exists |
| max | OpCode.Max | ✅ Exists |
| lerp | OpCode.Lerp OR Synthesis | ✅ Exists/Can synthesize |
| mix | Same as lerp | ✅ Alias |
| smoothstep | OpCode.Smoothstep OR Synthesis | ✅ Can synthesize |
| clamp | OpCode.Clamp | ✅ Exists |
| wrap | OpCode.Wrap01 | ✅ Exists |
| fract | OpCode.Wrap01 | ✅ Exists |

**Result:** All functions can be implemented with existing IR primitives. No new OpCodes required for v1.

## Testing Strategy

### Unit Tests

For each function:
1. Test with valid inputs (expected output)
2. Test with edge cases (0, 1, -1, NaN, Infinity)
3. Test type checking (correct types, wrong types)
4. Test arity checking (correct count, wrong count)

### Integration Tests

Test function composition:
```
sin(cos(phase))
clamp(lerp(a, b, smoothstep(0, 1, t)), 0, 1)
min(max(x, 0), 1)
```

### IR Compilation Tests

Verify each function compiles to correct IR:
1. Check OpCode used
2. Check signal types match
3. Check synthesized functions produce correct IR tree

## Related Documents

- `src/expr/GRAMMAR.md` - Grammar specification
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference rules
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling strategy
- `src/compiler/ir/types.ts` - OpCode enumeration

## Version History

- **2026-01-20**: Initial catalog (v1.0)
  - 16 built-in functions
  - All functions map to existing OpCodes or can be synthesized
  - Scalar types only (vec2/color deferred)
