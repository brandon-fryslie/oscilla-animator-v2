# Sprint: expr-dsl-extension - Expression DSL Block Reference Syntax

Generated: 2026-01-25-192523
Updated: 2026-01-26-023153
Confidence: HIGH: 3, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260125-181203.md
Prerequisite: SPRINT-20260125-192523-canonical-addressing-PLAN.md [COMPLETED]

Note: Lexer/Parser work can proceed immediately (no dependencies).
Type checker work requires Sprint 1 AddressRegistry (COMPLETED).

## Sprint Goal

Extend the Expression DSL to support block output references using canonical addresses. Users can reference any float output from any block in the patch directly in expressions using dot notation.

## Scope

**Deliverables:**
- Lexer support for dot notation identifiers
- Parser support for member access expressions
- Type checker resolution of block references
- Compiler emission for block reference nodes

## Background

User requirements specify:
- Named block references using canonical address system (not `$0` or `inputs[n]`)
- Syntax like `Circle1.radius * Oscillator.out`
- Float-only constraint (validated by varargs infrastructure, Sprint 2)

Current Expression DSL:
- Lexer handles simple identifiers (`[a-zA-Z_][a-zA-Z0-9_]*`)
- No dot notation or member access
- Type environment is `Map<string, PayloadType>`

## Work Items

### P0 (Critical) Lexer: Dot Token and Qualified Identifiers [HIGH]

**Dependencies**: None
**Spec Reference**: src/expr/lexer.ts (lines 109-118)
**Status Reference**: EVALUATION-20260125-181203.md - "No syntax for referencing external block outputs"

#### Description

Extend the lexer to tokenize dot (`.`) as a separate token and support qualified identifiers for block references. The lexer remains simple - it just produces tokens; parsing determines structure.

#### Acceptance Criteria

- [ ] `TokenKind.DOT` added for `.` character
- [ ] Lexer tokenizes `Circle1.radius` as: `IDENT("Circle1"), DOT, IDENT("radius")`
- [ ] Lexer handles chained dots: `a.b.c` -> `IDENT, DOT, IDENT, DOT, IDENT`
- [ ] Dot inside numbers (e.g., `3.14`) still produces `NUMBER("3.14")`
- [ ] Unit tests for dot tokenization
- [ ] Backward compatible - existing expressions continue to work

#### Technical Notes

Add to TokenKind enum (around line 52):
```typescript
DOT = 'DOT',
```

Add to single-character handling (around line 146):
```typescript
case '.':
  // Check if this is a decimal point in a number
  if (this.isDigit(this.peekNext())) {
    // This is ambiguous - could be "1.5" or "obj.5"
    // Since identifiers can't start with digits, treat as number
    return this.number(start);
  }
  return this.makeToken(TokenKind.DOT, ch, start);
```

Actually, the number case is already handled first (line 111-112), so dots after numbers like `1.5` work. We just need to add DOT for standalone dots.

---

### P0 (Critical) Parser: Member Access Expression [HIGH]

**Dependencies**: Lexer Dot Token
**Spec Reference**: src/expr/parser.ts, src/expr/ast.ts
**Status Reference**: EVALUATION-20260125-181203.md - "Option B: Block Reference"

#### Description

Extend the parser to handle member access expressions (`a.b`). This creates a new AST node type for block output references.

#### Acceptance Criteria

- [ ] `MemberAccessNode` AST type added
- [ ] Parser handles `identifier.identifier` as member access
- [ ] Member access is left-associative: `a.b.c` = `(a.b).c`
- [ ] Member access has highest precedence (binds tighter than unary)
- [ ] Parser produces clear error for invalid member access (e.g., `1.x`)
- [ ] Unit tests for member access parsing
- [ ] Grammar documented in GRAMMAR.md

#### Technical Notes

New AST node in `src/expr/ast.ts`:

```typescript
/**
 * Member access node (block output reference).
 * Represents `object.member` syntax for referencing block outputs.
 */
export interface MemberAccessNode {
  readonly kind: 'member';
  readonly object: ExprNode;
  readonly member: string;
  readonly pos: Position;
  readonly type?: PayloadType;
}

// Update ExprNode union
export type ExprNode =
  | LiteralNode
  | IdentifierNode
  | MemberAccessNode  // NEW
  | UnaryOpNode
  | BinaryOpNode
  | TernaryNode
  | CallNode;
```

Parser change in `src/expr/parser.ts` - add member access to primary parsing:

```typescript
private primary(): ExprNode {
  // ... existing primary handling

  // After parsing identifier, check for member access
  if (this.check(TokenKind.IDENT)) {
    let node: ExprNode = this.identifier();

    // Handle chained member access
    while (this.check(TokenKind.DOT)) {
      this.advance(); // consume DOT
      if (!this.check(TokenKind.IDENT)) {
        throw this.error('Expected identifier after "."');
      }
      const memberToken = this.advance();
      node = astMemberAccess(node, memberToken.value, {
        start: node.pos.start,
        end: memberToken.pos.end,
      });
    }
    return node;
  }

  // ... rest of primary
}
```

---

### P0 (Critical) Type Checker: Block Reference Resolution [HIGH]

**Dependencies**: Parser Member Access, Canonical Addressing (Sprint 1)
**Spec Reference**: src/expr/typecheck.ts (lines 38-89)
**Status Reference**: EVALUATION-20260125-181203.md - "Type checker resolves identifiers against environment map"

#### Description

Extend the type checker to resolve member access expressions against the block reference context. A `Circle1.radius` reference looks up the block by displayName/id and validates the output exists and is float.

#### Acceptance Criteria

- [ ] Type checker accepts `BlockReferenceContext` with patch/registry info
- [ ] Member access `a.b` resolves `a` as block displayName or id
- [ ] Member access validates `b` is an output port name
- [ ] Member access validates output type is float
- [ ] Non-float outputs produce type error with suggestion
- [ ] Unknown block/port produces clear error
- [ ] Ambiguous block names (duplicate displayNames) produce error
- [ ] Unit tests for block reference type checking

#### Technical Notes

Extend TypeEnv (or create new context):

```typescript
interface BlockReferenceContext {
  /** Address registry for resolving references */
  readonly addressRegistry: AddressRegistry;
  /** Allowed payload types (from vararg constraint) */
  readonly allowedPayloads: readonly PayloadType[];
}

interface TypeCheckContext {
  /** Input variables (existing) */
  readonly inputs: TypeEnv;
  /** Block reference context (new) */
  readonly blockRefs?: BlockReferenceContext;
}
```

Type checking for MemberAccessNode:

```typescript
function typecheckMemberAccess(
  node: MemberAccessNode,
  ctx: TypeCheckContext
): MemberAccessNode {
  if (!ctx.blockRefs) {
    throw new TypeError(
      'Block references not available in this context',
      node.pos
    );
  }

  // The object must be an identifier (block name)
  if (node.object.kind !== 'identifier') {
    throw new TypeError(
      'Block reference must be identifier.port (e.g., Circle1.radius)',
      node.object.pos
    );
  }

  const blockName = node.object.name;
  const portName = node.member;
  const alias = `${blockName}.${portName}`;

  // Resolve alias to canonical address
  const addr = ctx.blockRefs.addressRegistry.resolveAlias(alias);
  if (!addr) {
    throw new TypeError(
      `Unknown block or port: ${alias}`,
      node.pos,
      `Check that block "${blockName}" exists and has output "${portName}"`
    );
  }

  // Resolve to get type
  const resolved = ctx.blockRefs.addressRegistry.resolve(addressToString(addr));
  if (!resolved || resolved.kind !== 'output') {
    throw new TypeError(
      `${alias} is not an output`,
      node.pos
    );
  }

  // Validate payload type
  const payload = resolved.type.payload;
  if (!ctx.blockRefs.allowedPayloads.includes(payload)) {
    throw new TypeError(
      `${alias} has type ${payload}, expected one of: ${ctx.blockRefs.allowedPayloads.join(', ')}`,
      node.pos
    );
  }

  return withType(node, payload);
}
```

---

### P1 (High) Compiler: Block Reference Emission [MEDIUM]

**Dependencies**: Type Checker Block Reference Resolution, Varargs Infrastructure (Sprint 2)
**Spec Reference**: src/expr/compile.ts
**Status Reference**: EVALUATION-20260125-181203.md - "Expression compiler receives array and expands inline"

#### Description

Extend the expression compiler to emit IR for block reference nodes. The compiler looks up the signal ID from the varargs input array by matching the canonical address.

#### Acceptance Criteria

- [ ] Compiler handles `MemberAccessNode`
- [ ] Block references map to their corresponding signal in varargInputsById
- [ ] Compilation context includes resolved vararg connections
- [ ] Unknown reference at compile time is internal error (should be caught by type checker)
- [ ] Unit tests for block reference compilation

#### Technical Notes

Extend CompileContext:

```typescript
interface CompileContext {
  builder: IRBuilder;
  /** Input signals by name (existing - for in0, in1, etc.) */
  inputs: ReadonlyMap<string, SigExprId>;
  /** Block reference signals by canonical address (new) */
  blockRefs?: ReadonlyMap<string, SigExprId>;
}
```

Compilation for MemberAccessNode:

```typescript
function compileMemberAccess(
  node: MemberAccessNode,
  ctx: CompileContext
): SigExprId {
  if (!ctx.blockRefs) {
    throw new Error('Block references not available - internal error');
  }

  // Build the alias to look up
  if (node.object.kind !== 'identifier') {
    throw new Error('Invalid member access object - should have been caught by type checker');
  }

  const alias = `${node.object.name}.${node.member}`;

  // The signal should be in blockRefs, keyed by alias
  const sigId = ctx.blockRefs.get(alias);
  if (sigId === undefined) {
    throw new Error(`Block reference ${alias} not found in context - internal error`);
  }

  return sigId;
}
```

## Dependencies

- **Depends on Sprint 1**: AddressRegistry for resolving block references
- **Depends on Sprint 2**: VarargInputsById for providing signals at compile time
- **Can start early**: Lexer/Parser work is independent

## Risks

| Risk | Mitigation |
|------|------------|
| Ambiguous syntax with existing identifiers | Member access only valid on identifiers, not on numbers |
| Performance of alias resolution | AddressRegistry provides O(1) lookup |
| Namespace collisions (input name = block name) | Prioritize inputs over block refs; explicit disambiguation if needed |

## Exit Criteria

This sprint is complete when:
1. Expression `Circle1.radius * 2` parses correctly
2. Type checker validates block reference exists and is float
3. Compiled expression uses the correct signal from varargs
4. All existing expression tests continue to pass
