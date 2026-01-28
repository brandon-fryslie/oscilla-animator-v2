# Research Sprint - Implementation Context

Generated: 2026-01-20 11:01:00
Confidence: MEDIUM
Plan: SPRINT-20260120-110100-research-PLAN.md

## Purpose

This document provides comprehensive context for executing the Expression DSL research sprint. An agent with ONLY this document should be able to complete the research and decision-making tasks.

## Background

### What is the Expression DSL?

The Expression DSL allows artists to type mathematical expressions like `"sin(phase * 2) + 0.5"` into expression blocks, which compile to the existing IR (sigConst, sigMap, sigZip primitives). This provides a faster workflow than manually wiring blocks for simple math.

### Why Research is Needed

While the integration points are clear (block system, IR builder, type system), key design decisions remain:
1. **Parser approach** - hand-written vs library vs generated
2. **Type inference** - how to handle polymorphic literals and type resolution
3. **Error handling** - UX for syntax/type errors

These unknowns prevent high-confidence implementation planning.

## Relevant Codebase Context

### Block System (src/blocks/registry.ts)

Blocks register with this interface:

```typescript
interface BlockDef {
  type: string;                    // e.g., 'Expression'
  label: string;
  category: string;
  form: 'primitive' | 'macro';
  capability: Capability;
  inputs: Record<string, InputDef>;
  outputs: Record<string, OutputDef>;
  lower: (args: LowerArgs) => LowerResult;
}

interface LowerArgs {
  ctx: LowerCtx;                   // Provides IRBuilder, types, etc.
  inputs: ValueRefPacked[];        // Input signal/field IDs
  inputsById: Record<string, ValueRefPacked>;
  config?: Record<string, unknown>; // Block parameters (expression string here)
}

interface LowerResult {
  outputsById: Record<string, ValueRefPacked>;
}
```

The Expression block's `lower` function will:
1. Extract expression string from `config`
2. Extract input types from `ctx.inTypes`
3. Call expression compiler: `compileExpression(exprString, inputTypes, ctx.b) → Result<SigExprId, Error>`
4. Return `{ outputsById: { out: { k: 'sig', id: sigId, slot } } }`

**Key insight:** Expression compilation happens during block lowering, NOT at runtime.

### IR Builder (src/compiler/ir/IRBuilder.ts)

The expression compiler will use these IR builder methods:

```typescript
interface IRBuilder {
  // Constants
  sigConst(value: number, type: CanonicalType): SigExprId;

  // Unary operations
  sigMap(input: SigExprId, fn: PureFn, type: CanonicalType): SigExprId;

  // Binary/n-ary operations
  sigZip(inputs: SigExprId[], fn: PureFn, type: CanonicalType): SigExprId;

  // OpCode for primitive operations
  opcode(op: OpCode): PureFn;

  // Slot allocation
  allocSlot(): ValueSlot;
}
```

Example IR generation (from math-blocks.ts):
```typescript
// a + b compiles to:
const addFn = ctx.b.opcode(OpCode.Add);
const sigId = ctx.b.sigZip([a.id, b.id], addFn, canonicalType('float'));
```

**Key insight:** Expression AST compiles to a tree of `sigConst`, `sigMap`, and `sigZip` calls.

### Type System (src/core/canonical-types.ts)

```typescript
type PayloadType = 'float' | 'int' | 'bool' | 'phase' | 'unit' | 'vec2' | 'color';

interface CanonicalType {
  payload: PayloadType;
  extent: Extent;  // Cardinality, temporality, etc.
}

function canonicalType(payload: PayloadType): CanonicalType;
```

Expression type checker must work with PayloadType.

**Key insight:** For v1, focus on scalar types (float, int, bool, phase, unit). Vec2/color deferred.

### OpCode Enumeration (src/compiler/ir/types.ts)

Available primitive operations:
```typescript
enum OpCode {
  // Arithmetic
  Add, Sub, Mul, Div, Mod,

  // Math functions
  Sin, Cos, Tan, Sqrt, Abs,
  Floor, Ceil, Round,

  // Comparison
  Lt, Gt, Lte, Gte, Eq, Neq,

  // Logic
  And, Or, Not,

  // Interpolation
  Mix, Lerp, Smoothstep, Clamp,

  // Phase operations
  Wrap, Fract,

  // Min/Max
  Min, Max,
}
```

**Key insight:** Most expression operations map directly to OpCodes.

### Error Reporting (src/compiler/types.ts)

```typescript
interface CompileError {
  code: CompileErrorCode | string;
  message: string;
  where?: { blockId?: string; port?: string; edgeId?: string };
  details?: Record<string, unknown>;
}
```

Expression errors should use this format for consistency.

## Research Tasks Detail

### Task 1: Parser Approach Decision

**Goal:** Choose between hand-written, library-based, or generated parser.

**Evaluation Criteria:**

1. **Bundle Size Impact**
   - Measure: Add each library as dependency, run `npm run build`, check bundle size
   - Target: <10KB added size for library approach
   - Hand-written: 0KB (no dependency)

2. **Code Complexity**
   - Measure: Lines of code for minimal prototype (literal + binary op)
   - Target: <500 LOC for maintainability

3. **Error Recovery**
   - Measure: Can parser continue after syntax error to find more errors?
   - Target: Good error messages at error site

4. **Type Safety**
   - Measure: Does TypeScript catch parser bugs at compile time?
   - Target: Strongly typed AST output

**Approaches to Evaluate:**

**Option A: Hand-written Recursive Descent**
- Pros: No dependency, maximum control, type-safe
- Cons: More code, manual error recovery
- Prototype: Implement tokenizer + parser for `expr := literal | expr op expr`
- Estimate: 300-500 LOC

**Option B: Parser Combinator Library (Parsimmon)**
- Pros: Clean code, good errors, type-safe
- Cons: Dependency, learning curve
- Prototype: Install parsimmon, implement same grammar
- Estimate: 200-300 LOC
- Bundle size: Measure actual impact

**Option C: Generated Parser (PEG.js)**
- Pros: Declarative grammar, powerful
- Cons: Build step, less type-safe, larger bundle
- Prototype: Write PEG grammar, generate parser
- Estimate: 150 LOC grammar + 50 LOC glue
- Bundle size: Measure actual impact

**Deliverable:** `DECISIONS.md` documenting:
- Prototype results for each approach
- Bundle size measurements
- LOC comparison
- Error recovery capabilities
- Chosen approach with rationale

### Task 2: Type Inference Rules

**Goal:** Define unambiguous type checking rules.

**Key Decisions:**

1. **Literal Typing**
   - `42` → int or float? (decision: int, coerce to float if needed)
   - `3.14` → float
   - `true` → bool
   - `0.5` → float, phase, or unit? (decision: float, explicit cast for phase/unit)

2. **Type Coercion**
   - int → float: Allowed (safe)
   - float → int: Disallowed (lossy, require explicit `floor`/`ceil`/`round`)
   - float → phase: Disallowed (semantic difference, require explicit `wrap`)
   - float → unit: Disallowed (semantic difference, require explicit `clamp`)
   - phase + float → phase: Allowed (phase offset)
   - phase * float → phase: Allowed (phase scale)
   - phase + phase → ERROR (semantic error per spec)

3. **Operation Typing**
   - Arithmetic (`+`, `-`, `*`, `/`, `%`): numeric types, propagate most general
   - Comparison (`<`, `>`, etc.): numeric types → bool
   - Logic (`&&`, `||`, `!`): bool only
   - Ternary (`cond ? a : b`): cond is bool, a and b must unify

4. **Function Typing**
   - Each function has fixed signature: `(T1, T2, ...) → R`
   - Type check arguments match signature
   - Return type is R

5. **Input Resolution**
   - Identifiers reference block inputs
   - Input types come from connected ports (available in `ctx.inTypes`)
   - Undefined identifier → error

**Deliverable:** `TYPE-RULES.md` documenting:
- Literal type inference rules
- Type coercion table
- Operation type rules
- Function signature catalog
- Type checking algorithm (unification or constraint-based)
- 10+ examples with expected types or errors

### Task 3: Error Handling Strategy

**Goal:** Define error reporting that helps artists fix expressions.

**Error Categories:**

1. **Syntax Error**
   - Example: `sin(phase * )`
   - Message: "Expected expression after '*'"
   - Position: Character offset in string

2. **Type Error**
   - Example: `phase + phase`
   - Message: "Cannot add phase + phase (use phase + float for offset)"
   - Position: The '+' operator

3. **Undefined Identifier**
   - Example: `sin(unknown * 2)`
   - Message: "Undefined input 'unknown'. Available inputs: phase, radius"
   - Position: 'unknown' identifier

4. **Undefined Function**
   - Example: `foo(x)`
   - Message: "Unknown function 'foo'. Did you mean 'floor'?"
   - Position: 'foo' identifier

5. **Arity Mismatch**
   - Example: `sin(x, y)`
   - Message: "Function 'sin' expects 1 argument, got 2"
   - Position: Function call

**Error Recovery Options:**

**Option A: Fail-Fast**
- Report first error, stop compilation
- Pros: Simple, clear
- Cons: User must fix errors one at a time

**Option B: Multi-Error**
- Collect all errors, report together
- Pros: User sees all problems at once
- Cons: More complex parser, may report cascading errors

**Recommendation:** Start with fail-fast, add multi-error if users complain.

**Error Message Format:**

```typescript
interface ExpressionError {
  code: 'ExprSyntaxError' | 'ExprTypeError' | 'ExprUndefinedId' | 'ExprUndefinedFn' | 'ExprArityError';
  message: string;
  position: { start: number; end: number };  // Character offsets
  suggestion?: string;  // Helpful hint
}
```

Convert to CompileError for integration:
```typescript
function toCompileError(err: ExpressionError, blockId: string): CompileError {
  return {
    code: err.code,
    message: `Expression error: ${err.message}`,
    where: { blockId, port: 'expression' },
    details: { position: err.position, suggestion: err.suggestion }
  };
}
```

**Deliverable:** `ERRORS.md` documenting:
- Error taxonomy with examples
- Error message format
- Error recovery strategy
- UI integration plan
- 5+ examples of good vs bad error messages

### Task 4: Grammar Specification

**Goal:** Document the frozen grammar as ONE SOURCE OF TRUTH.

**Grammar (EBNF):**

```ebnf
expression  := ternary

ternary     := logical ("?" expression ":" expression)?

logical     := compare (("&&" | "||") compare)*

compare     := additive (("<" | ">" | "<=" | ">=" | "==" | "!=") additive)*

additive    := multiplicative (("+" | "-") multiplicative)*

multiplicative := unary (("*" | "/" | "%") unary)*

unary       := ("!" | "-" | "+") unary
             | call

call        := primary ("(" arguments? ")")?

primary     := NUMBER
             | IDENTIFIER
             | "(" expression ")"

arguments   := expression ("," expression)*

NUMBER      := [0-9]+ ("." [0-9]+)?
IDENTIFIER  := [a-zA-Z_][a-zA-Z0-9_]*
```

**Operator Precedence (High to Low):**

1. Unary: `!`, `-`, `+`
2. Multiplicative: `*`, `/`, `%`
3. Additive: `+`, `-`
4. Comparison: `<`, `>`, `<=`, `>=`, `==`, `!=`
5. Logical AND: `&&`
6. Logical OR: `||`
7. Ternary: `? :`

**Examples:**

Valid:
- `42`
- `phase * 2`
- `sin(phase) + 0.5`
- `x > 0 ? 1 : -1`
- `mix(a, b, phase)`
- `clamp(value, 0, 1)`

Invalid:
- `sin(` (unclosed paren)
- `phase +` (expected expression)
- `` (empty expression)

**Deliverable:** `src/expr/GRAMMAR.md` documenting:
- Complete EBNF grammar
- Operator precedence table
- Lexical rules (NUMBER, IDENTIFIER)
- 20+ valid examples
- 10+ invalid examples
- FROZEN marker with change process

### Task 5: Function Catalog

**Goal:** Document all built-in functions with IR mappings.

**Function Categories:**

**Math (Unary):**
- `sin(x: float) → float` - OpCode.Sin
- `cos(x: float) → float` - OpCode.Cos
- `tan(x: float) → float` - OpCode.Tan
- `sqrt(x: float) → float` - OpCode.Sqrt
- `abs(x: float) → float` - OpCode.Abs
- `floor(x: float) → int` - OpCode.Floor
- `ceil(x: float) → int` - OpCode.Ceil
- `round(x: float) → int` - OpCode.Round

**Math (Binary):**
- `min(a: T, b: T) → T` - OpCode.Min (polymorphic: int or float)
- `max(a: T, b: T) → T` - OpCode.Max (polymorphic: int or float)

**Interpolation:**
- `mix(a: float, b: float, t: float) → float` - OpCode.Mix or `(1-t)*a + t*b`
- `lerp(a: float, b: float, t: float) → float` - Alias for mix
- `smoothstep(edge0: float, edge1: float, x: float) → float` - OpCode.Smoothstep
- `clamp(x: float, min: float, max: float) → float` - OpCode.Clamp

**Phase:**
- `wrap(x: float) → phase` - OpCode.Wrap (fract)
- `fract(x: float) → float` - OpCode.Fract

**Verify all map to existing OpCodes or can be synthesized from primitives.**

**Deliverable:** `src/expr/FUNCTIONS.md` documenting:
- Function catalog grouped by category
- Each function: name, signature, description, IR mapping
- Note which functions require new OpCodes (should be none)
- Polymorphic functions clearly marked

## Success Criteria

This research sprint succeeds when all 5 deliverables are complete and reviewed:

1. ✅ `DECISIONS.md` - Parser approach chosen with rationale
2. ✅ `TYPE-RULES.md` - Type inference rules documented
3. ✅ `ERRORS.md` - Error handling strategy specified
4. ✅ `src/expr/GRAMMAR.md` - Grammar frozen
5. ✅ `src/expr/FUNCTIONS.md` - Function catalog complete

At that point, core implementation sprint can proceed at HIGH confidence.

## Files to Create/Modify

**Create:**
- `.agent_planning/expression-dsl/DECISIONS.md`
- `.agent_planning/expression-dsl/TYPE-RULES.md`
- `.agent_planning/expression-dsl/ERRORS.md`
- `src/expr/` (directory)
- `src/expr/GRAMMAR.md`
- `src/expr/FUNCTIONS.md`

**Reference (Read-Only):**
- `src/blocks/registry.ts`
- `src/blocks/math-blocks.ts`
- `src/compiler/ir/IRBuilder.ts`
- `src/compiler/ir/types.ts` (OpCode enum)
- `src/compiler/types.ts` (CompileError)
- `src/core/canonical-types.ts`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md`

## Constraints

**From Spec (ESSENTIAL-SPEC.md):**
- I6: Compiler never mutates the graph
- I19: First-class error taxonomy
- I20: Traceability by stable IDs

**From CLAUDE.md:**
- ONE SOURCE OF TRUTH: Grammar has exactly one definition
- SINGLE ENFORCER: Type checking happens once (in expression compiler)
- ONE-WAY DEPENDENCIES: DSL → IR (never reverse)
- LOCALITY: DSL changes don't affect rest of system

**Grammar Frozen:**
Once documented, grammar cannot change without spec update. This prevents scope creep.
