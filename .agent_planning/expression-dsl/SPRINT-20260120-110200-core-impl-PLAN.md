# Sprint: Core Implementation - Expression DSL Compiler

Generated: 2026-01-20 11:02:00
Confidence: HIGH (after research sprint completes)
Status: BLOCKED (depends on research sprint)
Source: EVALUATION-20260120-110100.md

## Sprint Goal

Implement the expression DSL compiler components: parser, AST, type checker, and IR code generator. This is the core of the DSL that compiles expression strings to IR.

## Scope

**Deliverables:**
- Expression parser (tokenizer + parser)
- AST type definitions
- Type checker
- IR compiler (AST → SigExprId)
- Public API: `compileExpression(text, inputs, builder) → Result<SigExprId, Error>`
- Comprehensive unit tests

**Out of Scope:**
- Expression block (deferred to integration sprint)
- UI components (deferred to integration sprint)
- Advanced features (vec2, color, custom functions)

## Prerequisites

**MUST complete research sprint first:**
- Parser approach decided
- Type inference rules specified
- Error handling strategy defined
- Grammar documented
- Function catalog complete

## Work Items

### P0: Expression AST Type Definitions

**Dependencies:** Grammar specification (from research sprint)
**Spec Reference:** ESSENTIAL-SPEC.md I20 (Traceability) • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Define TypeScript types for the expression AST. AST nodes represent the parsed expression structure and feed into type checker and IR compiler.

AST structure (based on grammar):
- Literals (number, boolean)
- Identifiers (input references)
- Binary operations (+, -, *, /, %, <, >, etc.)
- Unary operations (!, -, +)
- Function calls
- Ternary operator

Each node should have:
- Node kind discriminator
- Position information (for error messages)
- Type annotation (filled by type checker)

#### Acceptance Criteria

- [ ] Create `src/expr/ast.ts` with complete AST type definitions
- [ ] All AST node types have discriminated union (`kind` field)
- [ ] All nodes include `pos: { start: number; end: number }` for error reporting
- [ ] All nodes include `type?: CanonicalType` for type checker results
- [ ] AST is immutable (readonly fields)
- [ ] Provide helper functions: `astLiteral()`, `astBinary()`, etc.
- [ ] Include JSDoc comments explaining each node type

#### Technical Notes

Example AST structure:
```typescript
type ExprNode =
  | LiteralNode
  | IdentifierNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | TernaryNode;

interface LiteralNode {
  kind: 'literal';
  value: number | boolean;
  pos: { start: number; end: number };
  type?: CanonicalType;  // filled by type checker
}

interface BinaryOpNode {
  kind: 'binary';
  op: '+' | '-' | '*' | '/' | '%' | '<' | '>' | ...;
  left: ExprNode;
  right: ExprNode;
  pos: { start: number; end: number };
  type?: CanonicalType;
}

// ... etc.
```

---

### P0: Expression Parser Implementation

**Dependencies:** AST types, parser approach decision (from research sprint)
**Spec Reference:** ESSENTIAL-SPEC.md I19 (Error taxonomy) • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Implement the expression parser that converts expression strings to AST. Uses the approach chosen in research sprint (hand-written, library, or generated).

Parser must:
- Tokenize input string
- Parse according to grammar
- Build AST with position information
- Produce actionable syntax errors

#### Acceptance Criteria

- [ ] Create `src/expr/parser.ts` with parser implementation
- [ ] Implement tokenizer (if hand-written approach)
- [ ] Implement parser for full grammar (see GRAMMAR.md)
- [ ] Parser produces AST conforming to ast.ts types
- [ ] Syntax errors include position and helpful message
- [ ] Parser handles all valid examples from GRAMMAR.md
- [ ] Parser rejects all invalid examples with good errors
- [ ] Include 50+ unit tests covering all grammar productions
- [ ] Test error recovery (if multi-error strategy chosen)

#### Technical Notes

If hand-written recursive descent:
1. Tokenizer: Converts string to token stream
2. Parser: Recursive descent following grammar rules
3. Each grammar rule becomes a function
4. Operator precedence handled by parse order

If parser combinator library:
1. Define combinators for each grammar rule
2. Compose into complete parser
3. Use library's error reporting

If generated parser:
1. Write PEG/EBNF grammar file
2. Generate parser code
3. Add glue code for AST construction

Example test:
```typescript
test('parses binary expression', () => {
  const result = parse('a + b');
  expect(result.ok).toBe(true);
  expect(result.value).toEqual({
    kind: 'binary',
    op: '+',
    left: { kind: 'identifier', name: 'a', ... },
    right: { kind: 'identifier', name: 'b', ... },
    ...
  });
});
```

---

### P0: Expression Type Checker

**Dependencies:** AST types, type inference rules (from research sprint)
**Spec Reference:** ESSENTIAL-SPEC.md Type System, I19 (Errors) • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Implement type checker that annotates AST with types and validates type correctness. Uses type inference rules from research sprint.

Type checker must:
- Infer types bottom-up from literals and inputs
- Validate operation types
- Check function argument types
- Apply type coercion rules
- Produce actionable type errors

#### Acceptance Criteria

- [ ] Create `src/expr/typecheck.ts` with type checker implementation
- [ ] Type checker takes: AST + input type map → annotated AST or type error
- [ ] Implement type inference for all AST node types
- [ ] Implement type coercion per TYPE-RULES.md
- [ ] Type errors include position and suggestion
- [ ] Handle all examples from TYPE-RULES.md correctly
- [ ] Include 30+ unit tests covering type rules
- [ ] Test error messages for clarity

#### Technical Notes

Type checker is a tree walk that:
1. Visits AST nodes bottom-up
2. Infers type for each node
3. Validates parent-child type compatibility
4. Annotates nodes with inferred types

Example algorithm:
```typescript
function inferType(node: ExprNode, inputs: Map<string, PayloadType>): PayloadType {
  switch (node.kind) {
    case 'literal':
      return typeof node.value === 'number' ? 'float' : 'bool';
    case 'identifier':
      if (!inputs.has(node.name)) throw new TypeError(...);
      return inputs.get(node.name);
    case 'binary':
      const leftType = inferType(node.left, inputs);
      const rightType = inferType(node.right, inputs);
      return inferBinaryOpType(node.op, leftType, rightType);
    // ... etc.
  }
}
```

---

### P0: IR Compiler (AST → SigExprId)

**Dependencies:** AST types, type checker, IRBuilder
**Spec Reference:** ESSENTIAL-SPEC.md Compilation • **Status Reference:** EVALUATION-20260120-110100.md "Integration Points #2"

#### Description

Implement IR compiler that converts typed AST to IR expressions using IRBuilder. This is where expression AST becomes executable IR.

Compiler must:
- Walk typed AST bottom-up
- Generate IR calls (sigConst, sigMap, sigZip)
- Map operations to OpCodes
- Synthesize complex functions from primitives if needed

#### Acceptance Criteria

- [ ] Create `src/expr/compile.ts` with IR compiler implementation
- [ ] Compiler takes: typed AST + IRBuilder → SigExprId
- [ ] All AST node types compile to IR
- [ ] Binary ops map to appropriate OpCodes
- [ ] Function calls map per FUNCTIONS.md
- [ ] Compiler never throws (assumes AST is type-checked)
- [ ] Include 40+ unit tests covering all AST nodes
- [ ] Test complex expressions compile correctly

#### Technical Notes

Compiler is a tree walk that generates IR:

```typescript
function compileToIR(node: ExprNode, builder: IRBuilder, inputs: Map<string, SigExprId>): SigExprId {
  switch (node.kind) {
    case 'literal':
      return builder.sigConst(node.value, canonicalType(node.type!.payload));

    case 'identifier':
      return inputs.get(node.name)!;

    case 'binary':
      const left = compileToIR(node.left, builder, inputs);
      const right = compileToIR(node.right, builder, inputs);
      const opFn = builder.opcode(mapOpToOpCode(node.op));
      return builder.sigZip([left, right], opFn, canonicalType(node.type!.payload));

    case 'function':
      const args = node.args.map(arg => compileToIR(arg, builder, inputs));
      return compileFunctionCall(node.name, args, builder, node.type!);

    // ... etc.
  }
}
```

---

### P0: Public API and Integration

**Dependencies:** Parser, type checker, IR compiler
**Spec Reference:** ESSENTIAL-SPEC.md I26 (Architecture Laws) • **Status Reference:** EVALUATION-20260120-110100.md "Integration Points"

#### Description

Create the public API that the Expression block will use. This is the narrow interface that hides all DSL complexity from the rest of the system.

API must be simple:
```typescript
function compileExpression(
  text: string,
  inputs: Map<string, CanonicalType>,
  builder: IRBuilder
): Result<SigExprId, CompileError>
```

#### Acceptance Criteria

- [ ] Create `src/expr/index.ts` with public API
- [ ] Export `compileExpression` function
- [ ] Function chains: parse → typecheck → compile
- [ ] Convert ExpressionError to CompileError for consistency
- [ ] Hide all internal types (AST, etc.) from public API
- [ ] Include integration tests that use only public API
- [ ] Document usage with examples
- [ ] Verify API is sufficient for Expression block needs

#### Technical Notes

Implementation:
```typescript
export function compileExpression(
  text: string,
  inputs: Map<string, CanonicalType>,
  builder: IRBuilder
): Result<SigExprId, CompileError> {
  // Parse
  const parseResult = parse(text);
  if (!parseResult.ok) {
    return fail([toCompileError(parseResult.error)]);
  }

  // Type check
  const inputTypes = new Map(
    Array.from(inputs.entries()).map(([k, v]) => [k, v.payload])
  );
  const typeResult = typecheck(parseResult.value, inputTypes);
  if (!typeResult.ok) {
    return fail([toCompileError(typeResult.error)]);
  }

  // Compile to IR
  const inputExprs = ...; // Map input names to SigExprIds
  const irResult = compileToIR(typeResult.value, builder, inputExprs);

  return ok(irResult);
}
```

---

### P1: Comprehensive Test Suite

**Dependencies:** All core implementation
**Spec Reference:** ESSENTIAL-SPEC.md I21 (Deterministic) • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Create comprehensive test suite covering parser, type checker, and compiler. Tests validate correctness and provide regression protection.

#### Acceptance Criteria

- [ ] 50+ parser tests (valid expressions, syntax errors, edge cases)
- [ ] 30+ type checker tests (type inference, coercion, errors)
- [ ] 40+ compiler tests (IR generation, complex expressions)
- [ ] 20+ integration tests (end-to-end via public API)
- [ ] Test files: `src/expr/__tests__/parser.test.ts`, `typecheck.test.ts`, `compile.test.ts`, `integration.test.ts`
- [ ] All tests pass
- [ ] Test coverage >90% for expr module
- [ ] Tests document expected behavior (act as spec)

#### Technical Notes

Test categories:

**Parser Tests:**
- Valid expressions (literals, operations, functions)
- Operator precedence
- Parentheses
- Syntax errors
- Edge cases (empty, very long)

**Type Checker Tests:**
- Type inference
- Type coercion
- Type errors (mismatch, undefined identifier, etc.)
- Polymorphic functions

**Compiler Tests:**
- Simple expressions (literals, identifiers)
- Binary operations
- Unary operations
- Function calls
- Complex nested expressions

**Integration Tests:**
- End-to-end: text → IR
- Error propagation
- Real-world expressions

---

### P2: Module Documentation

**Dependencies:** All core implementation
**Spec Reference:** N/A • **Status Reference:** EVALUATION-20260120-110100.md "Gaps Summary"

#### Description

Document the expression DSL module for future maintainers. Documentation explains architecture, invariants, and extension points.

#### Acceptance Criteria

- [ ] Create `src/expr/README.md` with module overview
- [ ] Document architecture (parser → typecheck → compile)
- [ ] Document public API with examples
- [ ] Document invariants (grammar frozen, no runtime interpretation)
- [ ] Document how to add new functions
- [ ] Document how to add new operators (requires grammar change)
- [ ] Include troubleshooting guide for common errors
- [ ] Link to GRAMMAR.md, FUNCTIONS.md, TYPE-RULES.md

#### Technical Notes

README should answer:
- What is this module?
- How does it fit into the system?
- How do I use the API?
- How do I extend it?
- What are the invariants?
- How do I debug issues?

---

## Dependencies

**External:**
- Possibly parser library (if chosen in research sprint)

**Internal:**
- Research sprint MUST complete first
- IRBuilder interface (exists)
- Type system (exists)
- OpCode enum (exists)

## Risks

1. **Parser bugs produce cryptic errors** → Mitigation: Extensive tests, good error messages
2. **Type inference edge cases** → Mitigation: Follow rules from research sprint strictly
3. **IR generation bugs** → Mitigation: Unit test each AST node type

## Success Criteria

This sprint is complete when:
1. Parser converts strings to AST
2. Type checker validates AST types
3. IR compiler generates SigExprId
4. Public API integrates all three cleanly
5. Test suite validates correctness
6. Documentation explains module
7. All tests pass
8. Ready for Expression block integration (next sprint)
