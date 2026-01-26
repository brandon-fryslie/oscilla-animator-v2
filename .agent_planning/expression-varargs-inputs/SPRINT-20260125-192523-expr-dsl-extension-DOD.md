# Definition of Done: expr-dsl-extension

Generated: 2026-01-25-192523
Updated: 2026-01-26-023153
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260125-192523-expr-dsl-extension-PLAN.md
Prerequisite: canonical-addressing [COMPLETED]

## Acceptance Criteria

### Lexer: Dot Token and Qualified Identifiers

- [ ] `TokenKind.DOT` enum value added
- [ ] `.` tokenized as DOT (not part of identifier)
- [ ] `Circle1.radius` produces `[IDENT, DOT, IDENT]`
- [ ] `a.b.c` produces `[IDENT, DOT, IDENT, DOT, IDENT]`
- [ ] `3.14` still produces `NUMBER("3.14")` (decimal, not dot)
- [ ] Existing expression lexing unchanged
- [ ] Unit tests in `src/expr/__tests__/lexer.test.ts`

### Parser: Member Access Expression

- [ ] `MemberAccessNode` interface in `src/expr/ast.ts`
- [ ] `ExprNode` union includes `MemberAccessNode`
- [ ] `astMemberAccess()` builder function
- [ ] Parser produces MemberAccessNode for `a.b`
- [ ] Left-associative: `a.b.c` = `MemberAccess(MemberAccess(a, b), c)`
- [ ] Error for `1.x` (member access on number)
- [ ] GRAMMAR.md updated with member access production
- [ ] Unit tests in `src/expr/__tests__/parser.test.ts`

### Type Checker: Block Reference Resolution

- [ ] `BlockReferenceContext` interface defined
- [ ] `TypeCheckContext` extended with optional `blockRefs`
- [ ] MemberAccessNode type checking implemented
- [ ] Block name resolved via AddressRegistry.resolveAlias
- [ ] Port name validated against block outputs
- [ ] Payload type validated (float only for Expression)
- [ ] Clear errors for: unknown block, unknown port, wrong type
- [ ] Ambiguous displayName produces error
- [ ] Unit tests in `src/expr/__tests__/typecheck.test.ts`

### Compiler: Block Reference Emission

- [ ] `CompileContext.blockRefs` added (Map<string, SigExprId>)
- [ ] MemberAccessNode compilation implemented
- [ ] Looks up signal from blockRefs by alias
- [ ] Internal error if signal not found (type checker should catch)
- [ ] Unit tests in `src/expr/__tests__/compile.test.ts`

## Integration Verification

- [ ] Full pipeline test: `Circle1.radius * 2` end-to-end
- [ ] Expression block lowering provides blockRefs context
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Existing expression tests unchanged

## Documentation

- [ ] GRAMMAR.md updated with member access rule
- [ ] JSDoc on MemberAccessNode
- [ ] JSDoc on BlockReferenceContext
- [ ] JSDoc on TypeCheckContext.blockRefs
