# Expression DSL Grammar Specification

**Status:** FROZEN
**Last Updated:** 2026-01-20
**Change Process:** Grammar changes require spec update and cross-team review

## Overview

This document is the **ONE SOURCE OF TRUTH** for Expression DSL syntax. The grammar is intentionally simple, matching user expectations from JavaScript and mathematical notation.

## Grammar (EBNF)

```ebnf
expression      := ternary

ternary         := logical ("?" expression ":" expression)?

logical         := compare (("&&" | "||") compare)*

compare         := additive (("<" | ">" | "<=" | ">=" | "==" | "!=") additive)*

additive        := multiplicative (("+" | "-") multiplicative)*

multiplicative  := unary (("*" | "/" | "%") unary)*

unary           := ("!" | "-" | "+") unary
                 | call

call            := primary ("(" arguments? ")")?

primary         := NUMBER
                 | IDENTIFIER
                 | "(" expression ")"

arguments       := expression ("," expression)*
```

### Lexical Rules

```ebnf
NUMBER          := INTEGER | FLOAT
INTEGER         := [0-9]+
FLOAT           := [0-9]+ "." [0-9]+
IDENTIFIER      := [a-zA-Z_][a-zA-Z0-9_]*
WHITESPACE      := [ \t\n\r]+ (ignored)
```

## Operator Precedence

From highest to lowest precedence:

| Level | Operators | Associativity | Description |
|-------|-----------|---------------|-------------|
| 1 | `!`, `-`, `+` (unary) | Right | Logical not, negation, positive |
| 2 | `*`, `/`, `%` | Left | Multiplication, division, modulo |
| 3 | `+`, `-` (binary) | Left | Addition, subtraction |
| 4 | `<`, `>`, `<=`, `>=`, `==`, `!=` | Left | Comparison |
| 5 | `&&` | Left | Logical AND |
| 6 | `||` | Left | Logical OR |
| 7 | `? :` | Right | Ternary conditional |

This matches JavaScript/C precedence rules (PEMDAS with logical operators).

## Valid Syntax Examples

### Literals

```
42          // Integer literal
3.14        // Float literal
0.5         // Float literal
```

### Identifiers

```
phase       // Input reference
radius      // Input reference
my_value    // Input reference
_internal   // Input reference (underscore prefix allowed)
```

### Arithmetic

```
2 + 3
x * 2
a + b * c           // precedence: b*c first, then +a
(a + b) * c         // parentheses override precedence
```

### Function Calls

```
sin(phase)
cos(phase * 2)
min(a, b)
max(x, y)
clamp(value, 0, 1)
mix(a, b, 0.5)
```

### Unary Operators

```
-x              // Negation
!flag           // Logical NOT
+value          // Unary plus (no-op, allowed for symmetry)
-sin(phase)     // Negation of function result
```

### Comparison

```
x > 0
a < b
value >= 0.5
count <= 10
a == b
x != y
```

### Logical Operators

```
a && b
x || y
!flag
a > 0 && b < 1
```

### Ternary Conditional

```
x > 0 ? 1 : -1
flag ? a : b
cond1 ? (cond2 ? a : b) : c     // nested ternaries
```

### Complex Expressions

```
sin(phase * 2) + 0.5
mix(a, b, smoothstep(0, 1, t))
x > 0 ? sin(x) : cos(x)
clamp((value - min) / (max - min), 0, 1)
```

## Invalid Syntax Examples

### Missing Operands

```
sin(                // Unclosed parenthesis
phase +             // Expected expression after '+'
* 2                 // Missing left operand
```

### Empty Expressions

```
                    // Empty string is invalid
()                  // Empty parentheses (no expression inside)
sin()               // No arguments (arity error, not syntax error)
```

### Invalid Characters

```
phase @ 2           // '@' not in grammar
x $ y               // '$' not in grammar
```

### Invalid Function Calls

```
sin(x y)            // Missing comma between arguments
max(,x,y)           // Leading comma
min(x,,y)           // Double comma
```

### Malformed Numbers

```
.5                  // Leading decimal point not supported (use 0.5)
1.                  // Trailing decimal point not supported
1.2.3               // Multiple decimal points
```

## Design Rationale

### Why This Grammar?

1. **Familiar to artists**: Matches JavaScript/math notation
2. **Simple to parse**: LL(1) recursive descent, no ambiguity
3. **Extensible**: Can add operators/functions without grammar changes
4. **Type-safe**: AST structure enables strong type checking

### Why Frozen?

Grammar stability is critical for:
- User-facing feature: expression strings are saved in patches
- Backward compatibility: old patches must parse correctly
- Tooling: Syntax highlighters, linters, etc. depend on fixed grammar
- Documentation: Tutorials and examples become obsolete if grammar changes

Changes require:
1. Spec update with rationale
2. Migration plan for existing patches
3. Cross-team review (compiler, UI, docs)

### Deliberate Omissions

**No bitwise operators** (`&`, `|`, `^`, `<<`, `>>`): Not needed for animation math.

**No assignment** (`=`, `+=`, etc.): Expressions are pure, no side effects.

**No comma operator**: Use function arguments instead.

**No postfix increment** (`++`, `--`): No mutation, not useful.

**No exponentiation operator** (`**`): Use `pow(x, y)` function instead.

**No array/object literals**: Scalar expressions only (vec2/color deferred to future).

## Parser Implementation Notes

### Left-Associativity

Binary operators are left-associative:
- `a + b + c` parses as `(a + b) + c`
- `a - b - c` parses as `(a - b) - c`

Implement using iterative loop, not recursion, to avoid stack overflow.

### Right-Associativity

Unary and ternary operators are right-associative:
- `!!x` parses as `!(!x)`
- `a ? b : c ? d : e` parses as `a ? b : (c ? d : e)`

Implement using recursion.

### Error Recovery

For good error messages:
1. Track position (line, column) for each token
2. On error, report position and expected tokens
3. Consider: synchronize to statement boundary and continue parsing to find more errors

### Whitespace

Whitespace is insignificant and ignored. This is valid:
```
sin ( phase * 2 ) + 0.5
```

### Keywords

No reserved keywords. Any valid identifier is allowed (e.g., `sin` can be an input name, shadowing the function - parser disambiguates using call syntax).

## AST Structure

The grammar produces an Abstract Syntax Tree with these node types:

```typescript
type Expr =
  | { kind: 'literal'; value: number }
  | { kind: 'identifier'; name: string }
  | { kind: 'unary'; op: '!' | '-' | '+'; arg: Expr }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'ternary'; cond: Expr; then: Expr; else: Expr }
  | { kind: 'call'; fn: string; args: Expr[] }

type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'           // Arithmetic
  | '<' | '>' | '<=' | '>=' | '==' | '!=' // Comparison
  | '&&' | '||'                            // Logical
```

Each node should include position information for error reporting:
```typescript
interface Position {
  start: number;  // Character offset in input string
  end: number;    // Character offset after last character
}
```

## Testing Strategy

### Valid Parse Tests

For each example above, verify:
1. Parses without error
2. Produces expected AST structure
3. Precedence is correct

### Invalid Parse Tests

For each invalid example, verify:
1. Reports error at correct position
2. Error message is helpful
3. Suggests fix where applicable

### Fuzzing

Generate random expressions and verify:
1. Parser doesn't crash
2. Either parses successfully or reports clean error
3. No infinite loops or stack overflows

## Version History

- **2026-01-20**: Initial specification (v1.0)
  - Frozen grammar for Expression DSL research sprint
  - Operator precedence matches JavaScript/C
  - Scalar types only (vec2/color deferred)

## Related Documents

- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference rules
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling strategy
- `src/expr/FUNCTIONS.md` - Built-in function catalog
- `.agent_planning/expression-dsl/DECISIONS.md` - Parser implementation approach
