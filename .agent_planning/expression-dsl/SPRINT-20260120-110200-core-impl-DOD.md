# Definition of Done: Core Implementation Sprint

Generated: 2026-01-20 11:02:00
Confidence: HIGH (after research sprint completes)
Plan: SPRINT-20260120-110200-core-impl-PLAN.md

## Acceptance Criteria

### Expression AST Type Definitions

- [ ] Create `src/expr/ast.ts` with complete AST type definitions
- [ ] All AST node types have discriminated union (`kind` field)
- [ ] All nodes include `pos: { start: number; end: number }` for error reporting
- [ ] All nodes include `type?: SignalType` for type checker results
- [ ] AST is immutable (readonly fields)
- [ ] Provide helper functions: `astLiteral()`, `astBinary()`, etc.
- [ ] Include JSDoc comments explaining each node type

### Expression Parser Implementation

- [ ] Create `src/expr/parser.ts` with parser implementation
- [ ] Implement tokenizer (if hand-written approach)
- [ ] Implement parser for full grammar (see GRAMMAR.md)
- [ ] Parser produces AST conforming to ast.ts types
- [ ] Syntax errors include position and helpful message
- [ ] Parser handles all valid examples from GRAMMAR.md
- [ ] Parser rejects all invalid examples with good errors
- [ ] Include 50+ unit tests covering all grammar productions
- [ ] Test error recovery (if multi-error strategy chosen)

### Expression Type Checker

- [ ] Create `src/expr/typecheck.ts` with type checker implementation
- [ ] Type checker takes: AST + input type map → annotated AST or type error
- [ ] Implement type inference for all AST node types
- [ ] Implement type coercion per TYPE-RULES.md
- [ ] Type errors include position and suggestion
- [ ] Handle all examples from TYPE-RULES.md correctly
- [ ] Include 30+ unit tests covering type rules
- [ ] Test error messages for clarity

### IR Compiler (AST → SigExprId)

- [ ] Create `src/expr/compile.ts` with IR compiler implementation
- [ ] Compiler takes: typed AST + IRBuilder → SigExprId
- [ ] All AST node types compile to IR
- [ ] Binary ops map to appropriate OpCodes
- [ ] Function calls map per FUNCTIONS.md
- [ ] Compiler never throws (assumes AST is type-checked)
- [ ] Include 40+ unit tests covering all AST nodes
- [ ] Test complex expressions compile correctly

### Public API and Integration

- [ ] Create `src/expr/index.ts` with public API
- [ ] Export `compileExpression` function
- [ ] Function chains: parse → typecheck → compile
- [ ] Convert ExpressionError to CompileError for consistency
- [ ] Hide all internal types (AST, etc.) from public API
- [ ] Include integration tests that use only public API
- [ ] Document usage with examples
- [ ] Verify API is sufficient for Expression block needs

### Comprehensive Test Suite

- [ ] 50+ parser tests (valid expressions, syntax errors, edge cases)
- [ ] 30+ type checker tests (type inference, coercion, errors)
- [ ] 40+ compiler tests (IR generation, complex expressions)
- [ ] 20+ integration tests (end-to-end via public API)
- [ ] Test files: `src/expr/__tests__/parser.test.ts`, `typecheck.test.ts`, `compile.test.ts`, `integration.test.ts`
- [ ] All tests pass
- [ ] Test coverage >90% for expr module
- [ ] Tests document expected behavior (act as spec)

### Module Documentation

- [ ] Create `src/expr/README.md` with module overview
- [ ] Document architecture (parser → typecheck → compile)
- [ ] Document public API with examples
- [ ] Document invariants (grammar frozen, no runtime interpretation)
- [ ] Document how to add new functions
- [ ] Document how to add new operators (requires grammar change)
- [ ] Include troubleshooting guide for common errors
- [ ] Link to GRAMMAR.md, FUNCTIONS.md, TYPE-RULES.md

## Exit Criteria

This sprint successfully completes when:

- [ ] All core components implemented (parser, typecheck, compile)
- [ ] Public API complete and tested
- [ ] Test suite comprehensive (140+ tests total)
- [ ] All tests pass
- [ ] Code coverage >90%
- [ ] Documentation complete
- [ ] Module is self-contained (isolated from rest of system)
- [ ] Ready for Expression block integration (next sprint)

## Prerequisites (BLOCKERS)

**MUST complete research sprint first:**
- ✅ Parser approach decided (DECISIONS.md exists)
- ✅ Type inference rules specified (TYPE-RULES.md exists)
- ✅ Error handling strategy defined (ERRORS.md exists)
- ✅ Grammar documented (GRAMMAR.md exists)
- ✅ Function catalog complete (FUNCTIONS.md exists)

This sprint CANNOT start until research sprint deliverables exist.

## Deferred Work

The following items are explicitly OUT OF SCOPE for this sprint:

- **Expression Block** - User-facing block that uses the API (deferred to integration sprint)
- **UI Components** - Expression input field, autocomplete, etc. (deferred to integration sprint)
- **Advanced Types** - Vec2, color support (deferred to future)
- **Custom Functions** - User-defined functions (deferred to future, may never implement)
- **Performance Optimization** - Parser/compiler performance (defer until proven needed)

## Deliverable Files

Expected outputs from this sprint:

**Source Files:**
- `src/expr/index.ts` - Public API
- `src/expr/ast.ts` - AST type definitions
- `src/expr/parser.ts` - Expression parser
- `src/expr/typecheck.ts` - Type checker
- `src/expr/compile.ts` - IR compiler

**Test Files:**
- `src/expr/__tests__/parser.test.ts` - Parser tests
- `src/expr/__tests__/typecheck.test.ts` - Type checker tests
- `src/expr/__tests__/compile.test.ts` - Compiler tests
- `src/expr/__tests__/integration.test.ts` - Integration tests

**Documentation:**
- `src/expr/README.md` - Module documentation

**Specification Files (from research sprint):**
- `src/expr/GRAMMAR.md` - Grammar spec
- `src/expr/FUNCTIONS.md` - Function catalog
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type rules
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling
- `.agent_planning/expression-dsl/DECISIONS.md` - Design decisions

## Verification

To verify this sprint is complete:

1. **Functionality:** Run `compileExpression("sin(phase * 2) + 0.5", inputs, builder)` → should return valid SigExprId
2. **Tests:** Run `npm test src/expr` → all tests pass
3. **Coverage:** Check test coverage → >90%
4. **Type Safety:** Run `npm run typecheck` → no errors in src/expr
5. **Isolation:** Verify src/expr has no imports from src/blocks, src/ui, src/runtime (only from src/compiler/ir, src/core)
6. **Documentation:** Read README.md → understand how to use API
