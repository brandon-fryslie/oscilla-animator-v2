# Implementation Context: expr-dsl-extension

Generated: 2026-01-25-192523
Plan: SPRINT-20260125-192523-expr-dsl-extension-PLAN.md

## File Locations

### Files to Modify

1. **`src/expr/lexer.ts`** - Add DOT token
2. **`src/expr/ast.ts`** - Add MemberAccessNode
3. **`src/expr/parser.ts`** - Parse member access
4. **`src/expr/typecheck.ts`** - Type check block references
5. **`src/expr/compile.ts`** - Compile block references
6. **`src/expr/index.ts`** - Update public API
7. **`src/expr/GRAMMAR.md`** - Document new syntax

### Files for Tests

1. **`src/expr/__tests__/lexer.test.ts`**
2. **`src/expr/__tests__/parser.test.ts`**
3. **`src/expr/__tests__/typecheck.test.ts`**
4. **`src/expr/__tests__/integration.test.ts`**

## Lexer Changes

### Current Token Types (src/expr/lexer.ts:20-56)

```typescript
export enum TokenKind {
  NUMBER = 'NUMBER',
  IDENT = 'IDENT',
  // ... operators
  EOF = 'EOF',
}
```

### Add DOT Token

Add after line 52 (before EOF):

```typescript
// Member access
DOT = 'DOT',
```

### Single Character Handling (around line 146)

Current single-character switch handles `+`, `-`, `*`, etc. Add DOT case:

```typescript
// In the single-character switch statement
case '.':
  return this.makeToken(TokenKind.DOT, ch, start);
```

Note: The existing `number()` method (lines 181-203) handles decimal points in numbers by checking `this.peek() === '.' && this.isDigit(this.peekNext())`. This runs BEFORE the single-character handling, so `3.14` is correctly tokenized as NUMBER. A standalone `.` (like in `a.b`) will fall through to the DOT case.

## AST Changes

### Current ExprNode (src/expr/ast.ts:26-32)

```typescript
export type ExprNode =
  | LiteralNode
  | IdentifierNode
  | UnaryOpNode
  | BinaryOpNode
  | TernaryNode
  | CallNode;
```

### Add MemberAccessNode

Add after CallNode definition (around line 118):

```typescript
/**
 * Member access node (block output reference).
 * Represents `object.member` syntax.
 *
 * Example: `Circle1.radius` where Circle1 is a block displayName
 * and radius is an output port.
 *
 * Note: For block references, object is always an IdentifierNode.
 * Chained access like `a.b.c` is parsed as nested MemberAccess.
 */
export interface MemberAccessNode {
  readonly kind: 'member';
  /** The object being accessed (usually an IdentifierNode for block refs) */
  readonly object: ExprNode;
  /** The member name (port name for block refs) */
  readonly member: string;
  readonly pos: Position;
  readonly type?: PayloadType;
}
```

Update ExprNode union:

```typescript
export type ExprNode =
  | LiteralNode
  | IdentifierNode
  | MemberAccessNode  // NEW
  | UnaryOpNode
  | BinaryOpNode
  | TernaryNode
  | CallNode;
```

### Add Builder Function

Add after `astCall` (around line 162):

```typescript
/**
 * Create a member access node.
 */
export function astMemberAccess(object: ExprNode, member: string, pos: Position): MemberAccessNode {
  return { kind: 'member', object, member, pos };
}
```

## Parser Changes

### Current Primary Parsing (src/expr/parser.ts)

The parser uses recursive descent. Primary expressions are parsed at the bottom of the precedence hierarchy.

### Add Member Access Parsing

Member access should be handled right after primary parsing (it has highest precedence). Modify the `primary()` method:

```typescript
/**
 * Parse primary expression with optional member access.
 * primary = literal | identifier | '(' expr ')' | call
 * postfix = primary ('.' identifier)*
 */
private primary(): ExprNode {
  // Literal (number)
  if (this.check(TokenKind.NUMBER)) {
    return this.literal();
  }

  // Parenthesized expression
  if (this.check(TokenKind.LPAREN)) {
    this.advance(); // consume '('
    const expr = this.expression();
    this.expect(TokenKind.RPAREN, 'Expected ")" after expression');
    return expr;
  }

  // Identifier (possibly with member access or function call)
  if (this.check(TokenKind.IDENT)) {
    let node: ExprNode = this.identifierOrCall();

    // Handle member access chain: a.b.c
    while (this.check(TokenKind.DOT)) {
      const dotToken = this.advance(); // consume DOT
      if (!this.check(TokenKind.IDENT)) {
        throw this.error('Expected identifier after "."', dotToken.pos);
      }
      const memberToken = this.advance();
      node = astMemberAccess(node, memberToken.value, {
        start: node.pos.start,
        end: memberToken.pos.end,
      });
    }

    return node;
  }

  // Error: unexpected token
  const token = this.peek();
  throw this.error(
    `Unexpected token: ${token.kind}`,
    token.pos,
    ['number', 'identifier', '(']
  );
}
```

### identifierOrCall Helper

Extract identifier/call parsing if not already separate:

```typescript
/**
 * Parse identifier or function call.
 */
private identifierOrCall(): ExprNode {
  const nameToken = this.advance(); // consume IDENT
  const name = nameToken.value;

  // Check for function call
  if (this.check(TokenKind.LPAREN)) {
    return this.functionCall(name, nameToken.pos.start);
  }

  // Plain identifier
  return astIdentifier(name, nameToken.pos);
}
```

## Type Checker Changes

### Current TypeEnv (src/expr/typecheck.ts:38)

```typescript
export type TypeEnv = ReadonlyMap<string, PayloadType>;
```

### Add Block Reference Context

Add new types:

```typescript
import type { AddressRegistry } from '../types/canonical-address';

/**
 * Context for resolving block output references.
 */
export interface BlockReferenceContext {
  /** Registry for resolving block/port references */
  readonly addressRegistry: AddressRegistry;
  /** Allowed payload types (e.g., ['float'] for Expression block) */
  readonly allowedPayloads: readonly PayloadType[];
}

/**
 * Full type checking context.
 */
export interface TypeCheckContext {
  /** Local input variables (in0, in1, etc.) */
  readonly inputs: TypeEnv;
  /** Block reference context (optional - only for Expression-like blocks) */
  readonly blockRefs?: BlockReferenceContext;
}
```

### Modify typecheck Function

Current signature:
```typescript
export function typecheck(ast: ExprNode, inputs: TypeEnv): ExprNode;
```

New signature (backward compatible):
```typescript
export function typecheck(
  ast: ExprNode,
  inputs: TypeEnv,
  blockRefs?: BlockReferenceContext
): ExprNode;
```

Or use the full context:
```typescript
export function typecheck(ast: ExprNode, ctx: TypeCheckContext): ExprNode;
```

### Add MemberAccessNode Type Checking

In the switch statement for node kinds:

```typescript
case 'member':
  return typecheckMemberAccess(node as MemberAccessNode, ctx);
```

Implementation:

```typescript
function typecheckMemberAccess(
  node: MemberAccessNode,
  ctx: TypeCheckContext
): MemberAccessNode {
  // Block references require blockRefs context
  if (!ctx.blockRefs) {
    throw new TypeError(
      'Block references are not available in this context',
      node.pos,
      'Use input variables (in0, in1, etc.) instead'
    );
  }

  // Object must be an identifier for block reference
  if (node.object.kind !== 'identifier') {
    throw new TypeError(
      'Block reference must use simple identifier (e.g., Circle1.radius)',
      node.object.pos
    );
  }

  const blockName = (node.object as IdentifierNode).name;
  const portName = node.member;
  const alias = `${blockName}.${portName}`;

  // Resolve via address registry
  const addr = ctx.blockRefs.addressRegistry.resolveAlias(alias);
  if (!addr) {
    throw new TypeError(
      `Unknown block or port: ${alias}`,
      node.pos,
      `Check that "${blockName}" is a valid block name and "${portName}" is an output`
    );
  }

  // Get type information
  const resolved = ctx.blockRefs.addressRegistry.resolve(
    addressToString(addr)
  );
  if (!resolved || resolved.kind !== 'output') {
    throw new TypeError(
      `"${alias}" is not an output port`,
      node.pos
    );
  }

  // Validate payload type
  const payload = resolved.type.payload;
  if (!ctx.blockRefs.allowedPayloads.includes(payload)) {
    throw new TypeError(
      `"${alias}" has type "${payload}", but only ${ctx.blockRefs.allowedPayloads.join(', ')} is allowed`,
      node.pos,
      'Expression varargs inputs only accept float outputs'
    );
  }

  // Type check passes - annotate node with type
  return withType(node, payload);
}
```

## Compiler Changes

### Current CompileContext (src/expr/compile.ts)

```typescript
export interface CompileContext {
  builder: IRBuilder;
  inputs: ReadonlyMap<string, SigExprId>;
}
```

### Add Block Reference Signals

```typescript
export interface CompileContext {
  builder: IRBuilder;
  /** Input signals (in0, in1, etc.) */
  inputs: ReadonlyMap<string, SigExprId>;
  /** Block reference signals, keyed by alias (e.g., "Circle1.radius") */
  blockRefs?: ReadonlyMap<string, SigExprId>;
}
```

### Add MemberAccessNode Compilation

In the compile switch statement:

```typescript
case 'member':
  return compileMemberAccess(node as MemberAccessNode, ctx);
```

Implementation:

```typescript
function compileMemberAccess(
  node: MemberAccessNode,
  ctx: CompileContext
): SigExprId {
  if (!ctx.blockRefs) {
    throw new Error(
      'Block references not available in compile context - this is an internal error'
    );
  }

  // Build alias from the AST
  if (node.object.kind !== 'identifier') {
    throw new Error(
      'Invalid member access object - should have been caught by type checker'
    );
  }

  const blockName = (node.object as IdentifierNode).name;
  const alias = `${blockName}.${node.member}`;

  // Look up signal
  const sigId = ctx.blockRefs.get(alias);
  if (sigId === undefined) {
    throw new Error(
      `Block reference "${alias}" not found in compile context - this is an internal error`
    );
  }

  return sigId;
}
```

## Public API Changes

### Update compileExpression (src/expr/index.ts)

Current:
```typescript
export function compileExpression(
  exprText: string,
  inputs: ReadonlyMap<string, SignalType>,
  builder: IRBuilder,
  inputSignals: ReadonlyMap<string, SigExprId>
): CompileResult;
```

Extended:
```typescript
export interface ExpressionCompileOptions {
  /** Input type environment (in0, in1, etc.) */
  inputs: ReadonlyMap<string, SignalType>;
  /** Input signals */
  inputSignals: ReadonlyMap<string, SigExprId>;
  /** Block reference context (optional) */
  blockRefs?: {
    addressRegistry: AddressRegistry;
    allowedPayloads: readonly PayloadType[];
    signals: ReadonlyMap<string, SigExprId>;
  };
}

export function compileExpression(
  exprText: string,
  builder: IRBuilder,
  options: ExpressionCompileOptions
): CompileResult;

// Keep old signature for backward compatibility
export function compileExpression(
  exprText: string,
  inputs: ReadonlyMap<string, SignalType>,
  builder: IRBuilder,
  inputSignals: ReadonlyMap<string, SigExprId>,
  blockRefs?: {
    addressRegistry: AddressRegistry;
    allowedPayloads: readonly PayloadType[];
    signals: ReadonlyMap<string, SigExprId>;
  }
): CompileResult;
```

## GRAMMAR.md Updates

Add to the grammar documentation:

```markdown
## Member Access (Block References)

```
postfix = primary ( '.' IDENT )*
primary = IDENT | NUMBER | '(' expression ')' | call
```

Member access allows referencing block outputs by name:
- `Circle1.radius` - Output named "radius" from block with displayName "Circle1"
- `b3.out` - Output named "out" from block with id "b3"

Member access is left-associative: `a.b.c` parses as `(a.b).c`.

### Constraints

- Object must be an identifier (block name or id)
- Member must be an output port name
- Only available when block reference context is provided
- Type constraint depends on context (Expression block: float only)
```

## Test Examples

### Lexer Tests

```typescript
describe('dot tokenization', () => {
  it('tokenizes dot as DOT', () => {
    const tokens = tokenize('.');
    expect(tokens).toEqual([
      expect.objectContaining({ kind: TokenKind.DOT, value: '.' }),
      expect.objectContaining({ kind: TokenKind.EOF }),
    ]);
  });

  it('tokenizes member access', () => {
    const tokens = tokenize('Circle1.radius');
    expect(tokens).toEqual([
      expect.objectContaining({ kind: TokenKind.IDENT, value: 'Circle1' }),
      expect.objectContaining({ kind: TokenKind.DOT }),
      expect.objectContaining({ kind: TokenKind.IDENT, value: 'radius' }),
      expect.objectContaining({ kind: TokenKind.EOF }),
    ]);
  });

  it('tokenizes decimal numbers correctly', () => {
    const tokens = tokenize('3.14');
    expect(tokens).toEqual([
      expect.objectContaining({ kind: TokenKind.NUMBER, value: '3.14' }),
      expect.objectContaining({ kind: TokenKind.EOF }),
    ]);
  });
});
```

### Parser Tests

```typescript
describe('member access', () => {
  it('parses simple member access', () => {
    const ast = parse(tokenize('a.b'));
    expect(ast).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'a', pos: expect.any(Object) },
      member: 'b',
      pos: expect.any(Object),
    });
  });

  it('parses chained member access', () => {
    const ast = parse(tokenize('a.b.c'));
    expect(ast).toEqual({
      kind: 'member',
      object: {
        kind: 'member',
        object: { kind: 'identifier', name: 'a', pos: expect.any(Object) },
        member: 'b',
        pos: expect.any(Object),
      },
      member: 'c',
      pos: expect.any(Object),
    });
  });

  it('member access in expression', () => {
    const ast = parse(tokenize('Circle1.radius * 2'));
    expect(ast.kind).toBe('binary');
    expect((ast as BinaryOpNode).left.kind).toBe('member');
  });
});
```

### Integration Tests

```typescript
describe('block reference compilation', () => {
  it('compiles expression with block reference', () => {
    // Setup: create a mock address registry
    const registry = createMockAddressRegistry({
      'Circle1.radius': { type: signalType('float'), sigId: 42 },
    });

    const result = compileExpression(
      'Circle1.radius * 2',
      builder,
      {
        inputs: new Map(),
        inputSignals: new Map(),
        blockRefs: {
          addressRegistry: registry,
          allowedPayloads: ['float'],
          signals: new Map([['Circle1.radius', 42 as SigExprId]]),
        },
      }
    );

    expect(result.ok).toBe(true);
  });
});
```

## Adjacent Code Patterns

### Pattern: AST Node with Builder (from ast.ts:126-163)

```typescript
export interface LiteralNode {
  readonly kind: 'literal';
  readonly value: number;
  // ...
}

export function astLiteral(value: number, raw: string, pos: Position): LiteralNode {
  return { kind: 'literal', value, raw, pos };
}
```

Follow this pattern for MemberAccessNode.

### Pattern: Type Checking Switch (from typecheck.ts)

```typescript
function typecheckNode(node: ExprNode, env: TypeEnv): ExprNode {
  switch (node.kind) {
    case 'literal': return typecheckLiteral(node);
    case 'identifier': return typecheckIdentifier(node, env);
    // ...
  }
}
```

Add `case 'member'` to this switch.

### Pattern: Compile Switch (from compile.ts)

```typescript
function compile(node: ExprNode, ctx: CompileContext): SigExprId {
  switch (node.kind) {
    case 'literal': return compileLiteral(node, ctx);
    case 'identifier': return compileIdentifier(node, ctx);
    // ...
  }
}
```

Add `case 'member'` to this switch.
