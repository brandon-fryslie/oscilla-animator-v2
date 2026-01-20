# Expression DSL Module

This module implements a compile-time expression DSL for Oscilla blocks. Expressions are compiled to IR signal expressions during block lowering.

## Architecture

The expression compiler follows a traditional compiler pipeline:

```
Expression String → Lexer → Parser → Type Checker → IR Compiler → SigExprId
```

### Pipeline Stages

1. **Lexer** (`lexer.ts`): Tokenizes expression string
   - Input: String (e.g., `"sin(phase * 2) + 0.5"`)
   - Output: Token stream
   - Errors: Lexical errors (invalid characters)

2. **Parser** (`parser.ts`): Builds AST from tokens
   - Input: Token stream
   - Output: Abstract Syntax Tree (AST)
   - Errors: Syntax errors (malformed expressions)

3. **Type Checker** (`typecheck.ts`): Validates types and annotates AST
   - Input: AST + input type environment
   - Output: Typed AST
   - Errors: Type errors (incompatible types, undefined identifiers)

4. **IR Compiler** (`compile.ts`): Generates IR from typed AST
   - Input: Typed AST + IRBuilder + input signals
   - Output: IR signal expression ID (`SigExprId`)
   - Errors: None (assumes AST is well-typed)

## Public API

The module exports a single public function:

```typescript
import { compileExpression } from './expr';

const result = compileExpression(
  exprText,      // Expression string
  inputs,        // Map<string, SignalType> - input names to types
  builder,       // IRBuilder instance
  inputSignals   // Map<string, SigExprId> - input names to compiled signals
);

if (result.ok) {
  const sigId = result.value;  // Use in block lowering
} else {
  console.error(result.error.message);  // Handle error
}
```

## Grammar

See `GRAMMAR.md` for complete grammar specification.

**Operators** (precedence, highest to lowest):
1. Unary: `!`, `-`, `+`
2. Multiplicative: `*`, `/`, `%`
3. Additive: `+`, `-`
4. Comparison: `<`, `>`, `<=`, `>=`, `==`, `!=`
5. Logical AND: `&&`
6. Logical OR: `||`
7. Ternary: `? :`

**Literals:**
- Integer: `42`, `0`, `-10`
- Float: `3.14`, `0.5`, `1.0`

**Identifiers:**
- Input references: `phase`, `radius`, `my_value`

**Function Calls:**
- Syntax: `function(arg1, arg2, ...)`
- See `FUNCTIONS.md` for catalog of built-in functions

## Type System

See `.agent_planning/expression-dsl/TYPE-RULES.md` for complete type rules.

**Payload Types:**
- `int`: Integers
- `float`: Floating-point numbers
- `bool`: Booleans (from comparisons)
- `phase`: Wrapped [0, 1) values
- `unit`: Clamped [0, 1] values

**Type Coercion:**
- `int` → `float`: Allowed (safe)
- `int` → `phase`: Allowed (with wrap)
- `float` → `int`: Forbidden (use `floor`, `ceil`, `round`)
- `phase` → `float`: Allowed (loses wrapping semantics)

## Built-in Functions

See `FUNCTIONS.md` for complete catalog (16 functions).

**Trigonometric:** `sin`, `cos`, `tan`

**Unary Math:** `abs`, `sqrt`, `floor`, `ceil`, `round`

**Binary Math:** `min`, `max`

**Interpolation:** `lerp`, `mix`, `smoothstep`, `clamp`

**Phase:** `wrap`, `fract`

## Error Handling

Errors are reported with position information and suggestions:

```typescript
{
  code: 'ExprSyntaxError' | 'ExprTypeError' | 'ExprCompileError',
  message: "Undefined input 'phas'. Did you mean 'phase'?",
  position: { start: 0, end: 4 },
  suggestion: "Did you mean 'phase'?"
}
```

See `.agent_planning/expression-dsl/ERRORS.md` for error handling strategy.

## Invariants

**Grammar is FROZEN:** Expression syntax is user-facing and saved in patches. Changes require migration plan.

**No Runtime Interpretation:** Expressions are compiled to IR at lowering time. No eval() or runtime parsing.

**Type Safety:** All expressions are type-checked at compile time. Invalid types are caught before IR generation.

**Isolation:** This module depends ONLY on:
- `src/core/canonical-types.ts` (type system)
- `src/compiler/ir/IRBuilder.ts` (IR generation)

No dependencies on blocks, UI, or runtime.

## Extending the DSL

### Adding a New Operator

**Required:**
1. Update `GRAMMAR.md` with new operator syntax
2. Add token type in `lexer.ts`
3. Add parse rule in `parser.ts`
4. Add type inference rule in `typecheck.ts`
5. Add IR compilation in `compile.ts`
6. Add tests

**Note:** Operator changes require grammar freeze review.

### Adding a New Function

**Required:**
1. Add signature to `typecheck.ts` (`FUNCTION_SIGNATURES`)
2. Add IR compilation case in `compile.ts` (`compileCall`)
3. Document in `FUNCTIONS.md`
4. Add tests

**Optional:**
- Add new OpCode if needed (requires runtime support)
- Use kernel fallback if OpCode doesn't exist

**Example:**
```typescript
// typecheck.ts
const FUNCTION_SIGNATURES = {
  // ... existing functions
  pow: { params: ['float', 'float'], returnType: 'float' },
};

// compile.ts
case 'pow': {
  const fn = ctx.builder.kernel('pow'); // or opcode if available
  return ctx.builder.sigZip(args, fn, type);
}
```

## Testing

Run tests:
```bash
npm test src/expr
```

Test files:
- `__tests__/lexer.test.ts` - Tokenization tests
- `__tests__/parser.test.ts` - Parsing tests
- `__tests__/typecheck.test.ts` - Type checking tests
- `__tests__/integration.test.ts` - End-to-end tests

## Troubleshooting

### "Undefined input 'X'"

The identifier X is not in the input type environment. Check:
1. Input port exists on block
2. Input name matches exactly (case-sensitive)
3. Input is passed to `compileExpression` correctly

### "Function 'foo' expects N arguments, got M"

Function call has wrong arity. Check `FUNCTIONS.md` for correct signature.

### "Cannot add phase + phase"

Phase arithmetic restrictions. Use `phase + float` for offsets.

### "Logical AND requires bool operands"

Logical operators need boolean operands. Use comparisons:
```
// Wrong: x && y
// Right: x > 0 && y > 0
```

### Type errors in complex expressions

Break down expression into smaller parts and test each independently.

## Related Documents

- `GRAMMAR.md` - Grammar specification
- `FUNCTIONS.md` - Function catalog
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference rules
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling strategy
- `.agent_planning/expression-dsl/DECISIONS.md` - Design decisions

## Version History

- **2026-01-20**: Initial implementation (Sprint 2: Core Implementation)
  - Hand-written recursive descent parser
  - Bottom-up type inference
  - IR compilation using IRBuilder
  - 16 built-in functions
  - Comprehensive test suite
