# Expression DSL Type Inference Rules

**Status:** APPROVED
**Last Updated:** 2026-01-20
**Sprint:** Research (Sprint 1)

## Overview

This document specifies the type inference and checking rules for the Expression DSL. Type checking happens at **compile time** (during block lowering), not runtime, and must produce clear error messages for type mismatches.

## Type System Foundation

### PayloadType Enumeration

From `src/core/canonical-types.ts`:

```typescript
type PayloadType = 'float' | 'int' | 'bool' | 'phase' | 'unit' | 'vec2' | 'color';
```

**v1 Scope:** float, int, bool, phase, unit

**Deferred:** vec2, color (requires extended grammar and OpCodes)

### Semantic Meanings

| Type | Meaning | Range | Examples |
|------|---------|-------|----------|
| `int` | Integer | ℤ | 0, 42, -10 |
| `float` | Floating point | ℝ | 0.5, 3.14, -2.7 |
| `bool` | Boolean | {true, false} | true, false |
| `phase` | Wrapped angle/phase | [0, 1) | 0.0, 0.25, 0.999 |
| `unit` | Unit interval | [0, 1] | 0.0, 0.5, 1.0 |

**Key Insight:** `phase` and `unit` have semantic meaning beyond just "float in [0,1]". Type system enforces correct usage.

## Type Inference Algorithm

### Strategy: Bottom-Up with Constraints

Type inference proceeds bottom-up from leaves to root:

1. **Literals** have fixed types
2. **Identifiers** have types from inputs (provided by block lowering context)
3. **Operations** propagate types from operands, applying coercion rules
4. **Functions** have fixed signatures, check argument types
5. **Ternary** unifies types of branches

No Hindley-Milner unification needed - types flow upward deterministically.

### Algorithm Steps

```
inferType(expr, inputTypes):
  switch expr.kind:
    case 'literal':
      return inferLiteralType(expr.value)

    case 'identifier':
      if expr.name not in inputTypes:
        error "Undefined input '{expr.name}'"
      return inputTypes[expr.name]

    case 'unary':
      argType = inferType(expr.arg, inputTypes)
      return inferUnaryType(expr.op, argType)

    case 'binary':
      leftType = inferType(expr.left, inputTypes)
      rightType = inferType(expr.right, inputTypes)
      return inferBinaryType(expr.op, leftType, rightType)

    case 'ternary':
      condType = inferType(expr.cond, inputTypes)
      thenType = inferType(expr.then, inputTypes)
      elseType = inferType(expr.else, inputTypes)
      return inferTernaryType(condType, thenType, elseType)

    case 'call':
      argTypes = [inferType(arg, inputTypes) for arg in expr.args]
      return inferCallType(expr.fn, argTypes)
```

## Literal Type Inference

### Integer Literals

**Rule:** Digit sequence without decimal point → `int`

```
42          → int
0           → int
-10         → int (unary negation applied to int)
```

**Rationale:** Integers are exact, no floating-point error.

### Float Literals

**Rule:** Digit sequence with decimal point → `float`

```
3.14        → float
0.5         → float
1.0         → float
```

**Rationale:** Decimal point indicates floating-point representation.

### Boolean Literals

**Note:** No boolean literals in grammar. Booleans come from comparisons or logical operations.

### Polymorphic Literals

**Special Cases:**

- `0` → int (can coerce to float, phase, unit if needed)
- `1` → int (can coerce to float, unit if needed)
- `0.0` → float (can coerce to phase, unit if needed)
- `1.0` → float (can coerce to unit if needed)

**Strategy:** Infer most specific type (int or float), allow coercion at operation boundaries.

## Type Coercion Rules

### Allowed Coercions (Implicit)

| From | To | Safety | Rationale |
|------|-----|--------|-----------|
| int | float | Safe | No information loss |
| int | phase | Safe (with wrap) | Useful for phase offsets |
| int | unit | Safe (with clamp) | Useful for normalized values |

### Disallowed Coercions (Explicit Only)

| From | To | Why Disallowed | Explicit Function |
|------|-----|----------------|-------------------|
| float | int | Lossy | `floor(x)`, `ceil(x)`, `round(x)` |
| float | phase | Semantic difference | `wrap(x)` |
| float | unit | Semantic difference | `clamp(x, 0, 1)` |
| phase | float | Semantic loss | Allowed implicitly (no-op) |
| unit | float | Semantic loss | Allowed implicitly (no-op) |

### Coercion Application

Coercions apply at **operation boundaries**, not eagerly:

```
// Example: int + float
inferBinaryType('+', int, float):
  // Coerce int → float
  return float

// Example: phase + int
inferBinaryType('+', phase, int):
  // int → float, then phase + float → phase
  return phase
```

## Operation Type Rules

### Arithmetic Operators: `+`, `-`, `*`, `/`, `%`

**General Rule:** Numeric types only, return most general type.

| Left | Right | Result | Notes |
|------|-------|--------|-------|
| int | int | int | Exact arithmetic |
| int | float | float | int coerced to float |
| float | int | float | int coerced to float |
| float | float | float | |
| phase | float | phase | Phase offset (+ or -) or scale (* or /) |
| float | phase | phase | Symmetric |
| phase | phase | ERROR | Semantic error (see below) |

**Phase Arithmetic Restrictions:**

- `phase + phase` → ERROR: "Cannot add phase + phase. Use phase + float for offset."
- `phase - phase` → ERROR: "Cannot subtract phases. Compute phase difference explicitly."
- `phase * phase` → ERROR: "Cannot multiply phases."
- `phase / phase` → ERROR: "Cannot divide phases."

**Rationale:** Phase arithmetic has specific semantics. Adding phases is meaningless; adding a float offset to a phase is meaningful.

**Unit Arithmetic:**

- `unit + float` → float (loses unit constraint)
- `unit * float` → float (loses unit constraint)

**Rationale:** Unit type is for semantic checking, not preserved through arbitrary arithmetic.

### Comparison Operators: `<`, `>`, `<=`, `>=`, `==`, `!=`

**General Rule:** Numeric types, return `bool`.

| Left | Right | Result | Notes |
|------|-------|--------|-------|
| T | T | bool | T is numeric (int, float, phase, unit) |
| int | float | bool | int coerced to float |
| float | int | bool | int coerced to float |
| bool | bool | bool | Only `==` and `!=` allowed |

**Type Constraints:**
- Comparing bool with `<`, `>`, `<=`, `>=` → ERROR
- Comparing bool with `==`, `!=` → OK

### Logical Operators: `&&`, `||`

**Rule:** Both operands must be `bool`, result is `bool`.

| Left | Right | Result | Error |
|------|-------|--------|-------|
| bool | bool | bool | |
| int | bool | ERROR | "Left operand must be bool, got int" |
| bool | int | ERROR | "Right operand must be bool, got int" |

**Rationale:** No truthiness (unlike JavaScript). Explicit comparisons required.

Example:
```
x && y          // ERROR if x, y are not bool
x > 0 && y > 0  // OK (both comparisons are bool)
```

### Logical NOT: `!`

**Rule:** Operand must be `bool`, result is `bool`.

```
!true           → bool
!x              // ERROR if x is not bool
!(x > 0)        // OK
```

### Unary Negation: `-`

**Rule:** Operand must be numeric, result is same type.

| Operand | Result | Notes |
|---------|--------|-------|
| int | int | |
| float | float | |
| phase | phase | Negative phase (wraps to [0, 1)) |
| unit | ERROR | "Cannot negate unit type" |

**Rationale:** Negating unit produces negative values, violating [0, 1] constraint.

### Unary Plus: `+`

**Rule:** Operand must be numeric, result is same type (no-op).

```
+x              // Same as x
```

**Rationale:** Allowed for symmetry with `-`, but has no effect.

### Ternary: `cond ? then : else`

**Rules:**
1. `cond` must be `bool`
2. `then` and `else` must have compatible types
3. Result is unified type

**Type Unification:**

| Then | Else | Result | Notes |
|------|------|--------|-------|
| T | T | T | Same type |
| int | float | float | int coerced to float |
| float | int | float | int coerced to float |
| phase | float | phase | float coerced to phase (wrap) |
| float | phase | phase | float coerced to phase (wrap) |
| T | U | ERROR | Incompatible types (no coercion) |

Example:
```
x > 0 ? 1 : 0           → int
x > 0 ? 1 : 0.5         → float (1 coerced to 1.0)
x > 0 ? phase : 0.0     → phase (0.0 coerced to phase)
x > 0 ? true : 1        → ERROR (bool and int incompatible)
```

## Function Type Checking

### Signature Matching

Each function has a fixed signature. Type checker verifies:
1. Argument count matches
2. Argument types match (with coercion)
3. Return type is determined by signature

### Function Signatures

See `src/expr/FUNCTIONS.md` for complete catalog.

**Examples:**

```
sin(x: float) → float
  // x must be numeric, coerce to float
  sin(42)         → float (int coerced)
  sin(phase)      → float (phase coerced)
  sin(true)       → ERROR

min(a: T, b: T) → T
  // Polymorphic: T is int or float
  min(1, 2)       → int
  min(1.0, 2.0)   → float
  min(1, 2.0)     → float (int coerced)
  min(true, 1)    → ERROR

clamp(x: float, min: float, max: float) → float
  // All args numeric, coerce to float
  clamp(0.5, 0, 1)        → float
  clamp(phase, 0.0, 1.0)  → float
```

### Polymorphic Functions

Functions like `min`, `max`, `abs` work on multiple types:

**Strategy:** Use most specific type that satisfies both arguments.

```typescript
inferCallType('min', [type1, type2]):
  if type1 == int && type2 == int:
    return int
  else if numeric(type1) && numeric(type2):
    return float  // coerce to float
  else:
    error "min expects numeric types"
```

## Type Checking Examples

### Valid Expressions

```
sin(phase * 2)
  phase: phase (from input)
  2: int
  phase * 2 → phase (phase * int → phase)
  sin(phase) → float
  Result: float

x > 0 ? sin(x) : cos(x)
  x: float (from input)
  x > 0 → bool
  sin(x) → float
  cos(x) → float
  ternary(bool, float, float) → float
  Result: float

clamp((value - min) / (max - min), 0, 1)
  value, min, max: float (from inputs)
  value - min → float
  max - min → float
  (value - min) / (max - min) → float
  clamp(float, int, int) → float (ints coerced)
  Result: float
```

### Type Errors

```
phase + phase
  Error: "Cannot add phase + phase. Use phase + float for offset."
  Position: '+' operator

x && y
  (assuming x: float, y: float)
  Error: "Logical AND requires bool operands. Got float && float."
  Suggestion: "Did you mean 'x > 0 && y > 0'?"

sin(x, y)
  Error: "Function 'sin' expects 1 argument, got 2"
  Position: Function call

unknown
  Error: "Undefined input 'unknown'. Available inputs: phase, radius, count"
  Position: Identifier

x > 0 ? 1 : true
  Error: "Ternary branches have incompatible types: int and bool"
  Position: Ternary operator
```

## Type Environment (Input Types)

Input types are provided by block lowering context:

```typescript
interface LowerCtx {
  inTypes: Record<string, CanonicalType>;  // Input port name → type
  // ...
}
```

Expression compiler receives:
```typescript
compileExpression(
  exprString: string,
  inputTypes: Record<string, PayloadType>,  // Extract payload from CanonicalType
  builder: IRBuilder
): Result<SigExprId, CompileError>
```

**Example:**

Expression block has inputs:
- `phase` (type: phase)
- `radius` (type: float)

Expression: `sin(phase * radius)`

Type checking:
- `phase` → lookup in inputTypes → phase
- `radius` → lookup in inputTypes → float
- `phase * radius` → phase * float → phase
- `sin(phase)` → sin(float) → float (phase coerced)

## Type Checking Algorithm Implementation

### Data Structures

```typescript
interface TypeEnv {
  inputs: Record<string, PayloadType>;
}

interface TypeCheckResult {
  type: PayloadType;
  coercions: Coercion[];  // Track where coercions occur
}

interface Coercion {
  from: PayloadType;
  to: PayloadType;
  position: Position;
}
```

### Type Checker Interface

```typescript
function typeCheck(expr: Expr, env: TypeEnv): Result<PayloadType, TypeError>;
```

### Error Reporting

```typescript
interface TypeError {
  code: 'TypeError';
  message: string;
  position: Position;
  expected?: PayloadType[];
  got?: PayloadType;
  suggestion?: string;
}
```

## Testing Strategy

### Unit Tests

For each type rule:
1. Valid cases (expected type)
2. Invalid cases (expected error)
3. Coercion cases (verify coercion applied)

### Test Cases

```typescript
describe('Type Inference', () => {
  it('infers int literal', () => {
    expect(typeCheck('42', {})).toBe('int');
  });

  it('infers float literal', () => {
    expect(typeCheck('3.14', {})).toBe('float');
  });

  it('coerces int to float in addition', () => {
    const env = { x: 'float' };
    expect(typeCheck('x + 1', env)).toBe('float');
  });

  it('rejects phase + phase', () => {
    const env = { a: 'phase', b: 'phase' };
    expect(() => typeCheck('a + b', env)).toThrow('Cannot add phase + phase');
  });

  it('allows phase + float', () => {
    const env = { phase: 'phase' };
    expect(typeCheck('phase + 0.5', env)).toBe('phase');
  });

  it('requires bool for logical operators', () => {
    const env = { x: 'float', y: 'float' };
    expect(() => typeCheck('x && y', env)).toThrow('Logical AND requires bool');
  });

  it('infers bool from comparison', () => {
    const env = { x: 'float' };
    expect(typeCheck('x > 0', env)).toBe('bool');
  });

  it('unifies ternary branches', () => {
    const env = { cond: 'bool' };
    expect(typeCheck('cond ? 1 : 2', env)).toBe('int');
    expect(typeCheck('cond ? 1 : 2.0', env)).toBe('float');
  });
});
```

## Edge Cases

### Empty Expression

Error at parse time, not type check time.

### Undefined Identifier

```
sin(unknown)
  Error: "Undefined input 'unknown'"
```

### Type Mismatch in Function

```
sin(true)
  Error: "Function 'sin' expects numeric type, got bool"
```

### Arity Mismatch

Error at parse/call checking time, not type inference time.

## Performance Considerations

Type checking is **compile time**, not runtime:
- Happens once during block lowering
- No runtime type checks in executed IR
- Performance not critical (< 1ms for typical expressions)

## Related Documents

- `src/expr/GRAMMAR.md` - Expression syntax
- `src/expr/FUNCTIONS.md` - Built-in functions
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling
- `src/core/canonical-types.ts` - PayloadType definition

## Version History

- **2026-01-20**: Initial specification (v1.0)
  - Bottom-up type inference
  - Explicit coercion rules
  - Scalar types only (vec2/color deferred)
