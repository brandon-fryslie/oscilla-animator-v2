# Core Implementation Sprint - Implementation Context

Generated: 2026-01-20 11:02:00
Confidence: HIGH (after research sprint completes)
Plan: SPRINT-20260120-110200-core-impl-PLAN.md

## Purpose

This document provides comprehensive context for implementing the expression DSL compiler. An agent with ONLY this document and the research sprint deliverables should be able to implement the complete DSL.

## Prerequisites (MUST READ FIRST)

Before starting this sprint, you MUST have completed the research sprint and have these deliverables:

1. `.agent_planning/expression-dsl/DECISIONS.md` - Parser approach decision
2. `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference rules
3. `.agent_planning/expression-dsl/ERRORS.md` - Error handling strategy
4. `src/expr/GRAMMAR.md` - Grammar specification
5. `src/expr/FUNCTIONS.md` - Function catalog

These documents define ALL design decisions. Implementation follows them exactly.

## Architecture Overview

```
┌─────────────┐
│ Expression  │ (String)
│   String    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Parser    │ (src/expr/parser.ts)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│     AST     │ (src/expr/ast.ts)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Type Checker│ (src/expr/typecheck.ts)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Typed AST   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ IR Compiler │ (src/expr/compile.ts)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  SigExprId  │ (IR)
└─────────────┘
```

**Key Principle:** Each stage is a pure transformation. No mutation. No side effects.

## Implementation Order

Implement in this order (each depends on previous):

1. **AST Types** (`ast.ts`) - Foundation for all other components
2. **Parser** (`parser.ts`) - String → AST
3. **Type Checker** (`typecheck.ts`) - AST → Typed AST
4. **IR Compiler** (`compile.ts`) - Typed AST → SigExprId
5. **Public API** (`index.ts`) - Chains all together
6. **Tests** (`__tests__/*.test.ts`) - Validates correctness
7. **Documentation** (`README.md`) - Explains module

## Component Details

### 1. AST Types (src/expr/ast.ts)

**Purpose:** Define the expression AST structure.

**Design:**
- Discriminated union of node types
- Immutable (readonly fields)
- Position tracking for errors
- Type annotation slot for type checker

**Example Implementation:**

```typescript
/**
 * Expression AST Node
 *
 * All nodes have:
 * - kind: discriminator for type narrowing
 * - pos: character position in source (for errors)
 * - type: filled by type checker (undefined initially)
 */

export type ExprNode =
  | LiteralNode
  | IdentifierNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | TernaryNode;

/**
 * Position in source string
 */
export interface SourcePos {
  readonly start: number;  // Character offset (0-based)
  readonly end: number;    // Character offset (exclusive)
}

/**
 * Literal: 42, 3.14, true
 */
export interface LiteralNode {
  readonly kind: 'literal';
  readonly value: number | boolean;
  readonly pos: SourcePos;
  readonly type?: CanonicalType;  // filled by type checker
}

/**
 * Identifier: phase, radius, x
 */
export interface IdentifierNode {
  readonly kind: 'identifier';
  readonly name: string;
  readonly pos: SourcePos;
  readonly type?: CanonicalType;
}

/**
 * Binary operation: a + b, x < y
 */
export interface BinaryOpNode {
  readonly kind: 'binary';
  readonly op: BinaryOp;
  readonly left: ExprNode;
  readonly right: ExprNode;
  readonly pos: SourcePos;
  readonly type?: CanonicalType;
}

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '<' | '>' | '<=' | '>=' | '==' | '!='
  | '&&' | '||';

/**
 * Unary operation: -x, !b
 */
export interface UnaryOpNode {
  readonly kind: 'unary';
  readonly op: UnaryOp;
  readonly operand: ExprNode;
  readonly pos: SourcePos;
  readonly type?: CanonicalType;
}

export type UnaryOp = '-' | '+' | '!';

/**
 * Function call: sin(x), mix(a, b, t)
 */
export interface FunctionCallNode {
  readonly kind: 'call';
  readonly name: string;
  readonly args: readonly ExprNode[];
  readonly pos: SourcePos;
  readonly type?: CanonicalType;
}

/**
 * Ternary: cond ? a : b
 */
export interface TernaryNode {
  readonly kind: 'ternary';
  readonly condition: ExprNode;
  readonly consequent: ExprNode;
  readonly alternate: ExprNode;
  readonly pos: SourcePos;
  readonly type?: CanonicalType;
}

// Helper functions for constructing AST nodes
export function astLiteral(value: number | boolean, pos: SourcePos): LiteralNode {
  return { kind: 'literal', value, pos };
}

export function astIdentifier(name: string, pos: SourcePos): IdentifierNode {
  return { kind: 'identifier', name, pos };
}

export function astBinary(op: BinaryOp, left: ExprNode, right: ExprNode, pos: SourcePos): BinaryOpNode {
  return { kind: 'binary', op, left, right, pos };
}

// ... etc.
```

**Testing:**
- Test node construction helpers
- Test type discriminators work
- Test position tracking

### 2. Parser (src/expr/parser.ts)

**Purpose:** Convert expression string to AST.

**Design:**
- Follows approach from DECISIONS.md (hand-written, library, or generated)
- Produces syntax errors with position
- Handles full grammar from GRAMMAR.md

**If Hand-Written Recursive Descent:**

```typescript
import type { ExprNode } from './ast';
import { astLiteral, astBinary, ... } from './ast';

/**
 * Token types
 */
enum TokenKind {
  Number,
  Identifier,
  Plus, Minus, Star, Slash, Percent,
  Lt, Gt, Lte, Gte, Eq, Neq,
  And, Or, Not,
  LParen, RParen,
  Question, Colon,
  Comma,
  EOF
}

interface Token {
  kind: TokenKind;
  lexeme: string;
  pos: { start: number; end: number };
  value?: number;  // for Number tokens
}

/**
 * Tokenizer: string → Token[]
 */
class Tokenizer {
  private pos = 0;
  private tokens: Token[] = [];

  constructor(private source: string) {}

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      if (this.isDigit(ch)) {
        this.tokenizeNumber();
      } else if (this.isAlpha(ch)) {
        this.tokenizeIdentifier();
      } else {
        this.tokenizeOperator();
      }
    }

    this.tokens.push({ kind: TokenKind.EOF, lexeme: '', pos: { start: this.pos, end: this.pos } });
    return this.tokens;
  }

  private tokenizeNumber() {
    const start = this.pos;
    let lexeme = '';

    while (this.isDigit(this.peek())) {
      lexeme += this.advance();
    }

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      lexeme += this.advance(); // consume '.'
      while (this.isDigit(this.peek())) {
        lexeme += this.advance();
      }
    }

    const value = parseFloat(lexeme);
    this.tokens.push({ kind: TokenKind.Number, lexeme, value, pos: { start, end: this.pos } });
  }

  // ... more tokenizer methods
}

/**
 * Parser: Token[] → AST
 */
class Parser {
  private current = 0;

  constructor(private tokens: Token[]) {}

  parse(): ExprNode {
    return this.expression();
  }

  // expression := ternary
  private expression(): ExprNode {
    return this.ternary();
  }

  // ternary := logical ("?" expression ":" expression)?
  private ternary(): ExprNode {
    let expr = this.logical();

    if (this.match(TokenKind.Question)) {
      const question = this.previous();
      const consequent = this.expression();
      this.consume(TokenKind.Colon, "Expected ':' after ternary consequent");
      const alternate = this.expression();
      const pos = { start: expr.pos.start, end: alternate.pos.end };
      expr = astTernary(expr, consequent, alternate, pos);
    }

    return expr;
  }

  // logical := compare (("&&" | "||") compare)*
  private logical(): ExprNode {
    let expr = this.compare();

    while (this.match(TokenKind.And, TokenKind.Or)) {
      const operator = this.previous();
      const right = this.compare();
      const op = operator.kind === TokenKind.And ? '&&' : '||';
      const pos = { start: expr.pos.start, end: right.pos.end };
      expr = astBinary(op, expr, right, pos);
    }

    return expr;
  }

  // ... more parser methods following grammar

  private match(...kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(kind: TokenKind, message: string): Token {
    if (this.check(kind)) return this.advance();
    throw this.error(this.peek(), message);
  }

  private error(token: Token, message: string): SyntaxError {
    return {
      code: 'ExprSyntaxError',
      message,
      position: token.pos
    };
  }

  // ... utility methods
}

/**
 * Public parse function
 */
export function parse(source: string): Result<ExprNode, SyntaxError> {
  try {
    const tokenizer = new Tokenizer(source);
    const tokens = tokenizer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return { ok: true, value: ast };
  } catch (err) {
    return { ok: false, error: err as SyntaxError };
  }
}
```

**Testing:**
- Test each grammar production
- Test operator precedence
- Test syntax error messages
- Test edge cases (empty, very long, etc.)

### 3. Type Checker (src/expr/typecheck.ts)

**Purpose:** Annotate AST with types and validate type correctness.

**Design:**
- Follows TYPE-RULES.md exactly
- Bottom-up type inference
- Produces type errors with position

**Example Implementation:**

```typescript
import type { ExprNode, BinaryOp, UnaryOp } from './ast';
import type { PayloadType, CanonicalType } from '../core/canonical-types';
import { canonicalType } from '../core/canonical-types';

export interface TypeError {
  code: 'ExprTypeError';
  message: string;
  position: { start: number; end: number };
  suggestion?: string;
}

/**
 * Type check and annotate AST
 */
export function typecheck(
  node: ExprNode,
  inputs: Map<string, PayloadType>
): Result<ExprNode, TypeError> {
  try {
    const typed = inferType(node, inputs);
    return { ok: true, value: typed };
  } catch (err) {
    return { ok: false, error: err as TypeError };
  }
}

/**
 * Infer type for AST node (bottom-up)
 */
function inferType(node: ExprNode, inputs: Map<string, PayloadType>): ExprNode {
  switch (node.kind) {
    case 'literal': {
      const payloadType = typeof node.value === 'number' ? 'float' : 'bool';
      return { ...node, type: canonicalType(payloadType) };
    }

    case 'identifier': {
      if (!inputs.has(node.name)) {
        const available = Array.from(inputs.keys()).join(', ');
        throw {
          code: 'ExprTypeError',
          message: `Undefined input '${node.name}'. Available inputs: ${available}`,
          position: node.pos
        };
      }
      const payloadType = inputs.get(node.name)!;
      return { ...node, type: canonicalType(payloadType) };
    }

    case 'binary': {
      const left = inferType(node.left, inputs);
      const right = inferType(node.right, inputs);
      const resultType = inferBinaryOpType(node.op, left.type!, right.type!, node.pos);
      return { ...node, left, right, type: resultType };
    }

    case 'unary': {
      const operand = inferType(node.operand, inputs);
      const resultType = inferUnaryOpType(node.op, operand.type!, node.pos);
      return { ...node, operand, type: resultType };
    }

    case 'call': {
      const args = node.args.map(arg => inferType(arg, inputs));
      const resultType = inferFunctionType(node.name, args.map(a => a.type!), node.pos);
      return { ...node, args, type: resultType };
    }

    case 'ternary': {
      const condition = inferType(node.condition, inputs);
      const consequent = inferType(node.consequent, inputs);
      const alternate = inferType(node.alternate, inputs);

      if (condition.type!.payload !== 'bool') {
        throw {
          code: 'ExprTypeError',
          message: `Ternary condition must be bool, got ${condition.type!.payload}`,
          position: condition.pos
        };
      }

      const resultType = unifyTypes(consequent.type!, alternate.type!, node.pos);
      return { ...node, condition, consequent, alternate, type: resultType };
    }
  }
}

/**
 * Infer type for binary operation
 */
function inferBinaryOpType(
  op: BinaryOp,
  left: CanonicalType,
  right: CanonicalType,
  pos: { start: number; end: number }
): CanonicalType {
  // Arithmetic: +, -, *, /, %
  if (['+', '-', '*', '/', '%'].includes(op)) {
    return inferArithmeticType(op, left.payload, right.payload, pos);
  }

  // Comparison: <, >, <=, >=, ==, !=
  if (['<', '>', '<=', '>=', '==', '!='].includes(op)) {
    return inferComparisonType(left.payload, right.payload, pos);
  }

  // Logic: &&, ||
  if (['&&', '||'].includes(op)) {
    return inferLogicalType(left.payload, right.payload, pos);
  }

  throw { code: 'ExprTypeError', message: `Unknown operator: ${op}`, position: pos };
}

function inferArithmeticType(
  op: BinaryOp,
  left: PayloadType,
  right: PayloadType,
  pos: { start: number; end: number }
): CanonicalType {
  // Follow TYPE-RULES.md
  // Example: float + int → float (int coerces to float)
  // Example: phase + float → phase (per spec)
  // Example: phase + phase → ERROR

  // ... implement per TYPE-RULES.md
}

// ... more type inference functions
```

**Testing:**
- Test type inference for each node type
- Test type coercion rules
- Test type errors
- Test error messages

### 4. IR Compiler (src/expr/compile.ts)

**Purpose:** Convert typed AST to IR expressions.

**Design:**
- Bottom-up AST walk
- Generates IRBuilder calls
- Maps operations to OpCodes

**Example Implementation:**

```typescript
import type { ExprNode } from './ast';
import type { SigExprId } from '../compiler/ir/Indices';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import { OpCode } from '../compiler/ir/types';

/**
 * Compile typed AST to IR
 */
export function compileToIR(
  node: ExprNode,
  builder: IRBuilder,
  inputs: Map<string, SigExprId>
): SigExprId {
  switch (node.kind) {
    case 'literal': {
      return builder.sigConst(node.value as number, node.type!);
    }

    case 'identifier': {
      const sigId = inputs.get(node.name);
      if (!sigId) throw new Error(`Missing input: ${node.name}`);
      return sigId;
    }

    case 'binary': {
      const left = compileToIR(node.left, builder, inputs);
      const right = compileToIR(node.right, builder, inputs);
      const opFn = builder.opcode(binaryOpToOpCode(node.op));
      return builder.sigZip([left, right], opFn, node.type!);
    }

    case 'unary': {
      const operand = compileToIR(node.operand, builder, inputs);
      const opFn = builder.opcode(unaryOpToOpCode(node.op));
      return builder.sigMap(operand, opFn, node.type!);
    }

    case 'call': {
      const args = node.args.map(arg => compileToIR(arg, builder, inputs));
      return compileFunctionCall(node.name, args, builder, node.type!);
    }

    case 'ternary': {
      const cond = compileToIR(node.condition, builder, inputs);
      const consequent = compileToIR(node.consequent, builder, inputs);
      const alternate = compileToIR(node.alternate, builder, inputs);
      // Ternary: cond ? a : b → compiled as ifThenElse(cond, a, b)
      const ternaryFn = builder.opcode(OpCode.IfThenElse);
      return builder.sigZip([cond, consequent, alternate], ternaryFn, node.type!);
    }
  }
}

function binaryOpToOpCode(op: BinaryOp): OpCode {
  switch (op) {
    case '+': return OpCode.Add;
    case '-': return OpCode.Sub;
    case '*': return OpCode.Mul;
    case '/': return OpCode.Div;
    case '%': return OpCode.Mod;
    case '<': return OpCode.Lt;
    case '>': return OpCode.Gt;
    case '<=': return OpCode.Lte;
    case '>=': return OpCode.Gte;
    case '==': return OpCode.Eq;
    case '!=': return OpCode.Neq;
    case '&&': return OpCode.And;
    case '||': return OpCode.Or;
  }
}

function unaryOpToOpCode(op: UnaryOp): OpCode {
  switch (op) {
    case '-': return OpCode.Negate;
    case '+': return OpCode.Identity;  // no-op
    case '!': return OpCode.Not;
  }
}

function compileFunctionCall(
  name: string,
  args: SigExprId[],
  builder: IRBuilder,
  resultType: CanonicalType
): SigExprId {
  // Map function names to OpCodes per FUNCTIONS.md
  switch (name) {
    case 'sin': {
      const fn = builder.opcode(OpCode.Sin);
      return builder.sigMap(args[0], fn, resultType);
    }
    case 'cos': {
      const fn = builder.opcode(OpCode.Cos);
      return builder.sigMap(args[0], fn, resultType);
    }
    case 'mix': {
      const fn = builder.opcode(OpCode.Mix);
      return builder.sigZip(args, fn, resultType);
    }
    // ... etc. per FUNCTIONS.md
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}
```

**Testing:**
- Test each AST node type compiles
- Test complex nested expressions
- Test function calls
- Verify IR structure matches expected

### 5. Public API (src/expr/index.ts)

**Purpose:** Provide clean API for Expression block to use.

**Implementation:**

```typescript
import { parse } from './parser';
import { typecheck } from './typecheck';
import { compileToIR } from './compile';
import type { SigExprId } from '../compiler/ir/Indices';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { CanonicalType } from '../core/canonical-types';
import type { CompileError } from '../compiler/types';

/**
 * Compile expression string to IR
 *
 * @param text - Expression string (e.g., "sin(phase * 2) + 0.5")
 * @param inputs - Map of input names to their types
 * @param builder - IR builder instance
 * @returns SigExprId or compile error
 */
export function compileExpression(
  text: string,
  inputs: Map<string, CanonicalType>,
  builder: IRBuilder
): Result<SigExprId, CompileError> {
  // 1. Parse
  const parseResult = parse(text);
  if (!parseResult.ok) {
    return { ok: false, error: toCompileError(parseResult.error) };
  }

  // 2. Type check
  const inputTypes = new Map(
    Array.from(inputs.entries()).map(([k, v]) => [k, v.payload])
  );
  const typecheckResult = typecheck(parseResult.value, inputTypes);
  if (!typecheckResult.ok) {
    return { ok: false, error: toCompileError(typecheckResult.error) };
  }

  // 3. Compile to IR
  // Map input names to dummy SigExprIds (Expression block will provide real ones)
  const inputExprs = new Map<string, SigExprId>();
  // ... populate from actual block inputs

  const irResult = compileToIR(typecheckResult.value, builder, inputExprs);

  return { ok: true, value: irResult };
}

function toCompileError(err: any): CompileError {
  return {
    code: err.code,
    message: err.message,
    details: { position: err.position, suggestion: err.suggestion }
  };
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

**Testing:**
- Test end-to-end: string → SigExprId
- Test error propagation
- Test with real IRBuilder

## Testing Strategy

### Unit Tests

**Parser Tests** (`src/expr/__tests__/parser.test.ts`):
- Valid expressions
- Operator precedence
- Parentheses
- Syntax errors
- Edge cases

**Type Checker Tests** (`src/expr/__tests__/typecheck.test.ts`):
- Type inference
- Type coercion
- Type errors
- Polymorphic functions

**Compiler Tests** (`src/expr/__tests__/compile.test.ts`):
- Simple expressions
- Binary/unary operations
- Function calls
- Complex nested expressions

**Integration Tests** (`src/expr/__tests__/integration.test.ts`):
- End-to-end via public API
- Error propagation
- Real-world expressions

### Test Coverage

Target: >90% coverage for src/expr module

Run: `npm test src/expr -- --coverage`

## Constraints and Invariants

**From CLAUDE.md:**
- ONE SOURCE OF TRUTH: Grammar in GRAMMAR.md is canonical
- SINGLE ENFORCER: Type checking happens once (in typecheck.ts)
- ONE-WAY DEPENDENCIES: expr → IR (never reverse)
- LOCALITY: Changes to expr don't affect rest of system

**Module Isolation:**
- src/expr can import from: src/core, src/compiler/ir
- src/expr CANNOT import from: src/blocks, src/ui, src/runtime, src/stores
- Rest of system only sees public API in index.ts

**Grammar Frozen:**
- Grammar in GRAMMAR.md cannot change without spec update
- Prevents scope creep

**No Runtime Interpretation:**
- Expressions compile to IR at block lowering time
- No expression evaluation at runtime
- No AST in runtime state

## Troubleshooting

**Parser errors are cryptic:**
- Check error message includes position
- Check error message suggests fix
- Add more context to error (show nearby code)

**Type checker rejects valid expression:**
- Check TYPE-RULES.md
- Verify type coercion rules implemented correctly
- Check example in TYPE-RULES.md matches implementation

**IR generation produces wrong result:**
- Check OpCode mapping in compile.ts
- Verify IR structure with unit test
- Compare to hand-written block (e.g., Add block)

**Tests fail:**
- Check test expectations match TYPE-RULES.md
- Verify grammar in tests matches GRAMMAR.md
- Check type checker and compiler agree on types

## Files to Create

**Source Files:**
1. `src/expr/index.ts` - Public API (150 LOC)
2. `src/expr/ast.ts` - AST types (200 LOC)
3. `src/expr/parser.ts` - Parser (400 LOC if hand-written, 250 if library)
4. `src/expr/typecheck.ts` - Type checker (300 LOC)
5. `src/expr/compile.ts` - IR compiler (250 LOC)

**Test Files:**
6. `src/expr/__tests__/parser.test.ts` (300 LOC)
7. `src/expr/__tests__/typecheck.test.ts` (200 LOC)
8. `src/expr/__tests__/compile.test.ts` (250 LOC)
9. `src/expr/__tests__/integration.test.ts` (150 LOC)

**Documentation:**
10. `src/expr/README.md` (Documentation)

**Total:** ~2200-2400 LOC

## Success Criteria

Sprint complete when:
- All 10 files created
- All tests pass (npm test src/expr)
- Coverage >90%
- Public API works: `compileExpression("sin(phase * 2) + 0.5", ...) → SigExprId`
- Module isolated (no imports from blocks/ui/runtime)
- Documentation complete
