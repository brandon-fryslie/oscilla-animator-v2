# Definition of Done: expr-dsl-extension

Generated: 2026-01-25-192523
Updated: 2026-01-26-023153
Completed: 2026-01-26
Status: COMPLETED
Plan: SPRINT-20260125-192523-expr-dsl-extension-PLAN.md
Prerequisite: canonical-addressing [COMPLETED]

## Acceptance Criteria

### Lexer: Dot Token and Qualified Identifiers

- [x] `TokenKind.DOT` enum value added
- [x] `.` tokenized as DOT (not part of identifier)
- [x] `Circle1.radius` produces `[IDENT, DOT, IDENT]`
- [x] `a.b.c` produces `[IDENT, DOT, IDENT, DOT, IDENT]`
- [x] `3.14` still produces `NUMBER("3.14")` (decimal, not dot)
- [x] Existing expression lexing unchanged
- [x] Unit tests in `src/expr/__tests__/lexer.test.ts`

### Parser: Member Access Expression

- [x] `MemberAccessNode` interface in `src/expr/ast.ts`
- [x] `ExprNode` union includes `MemberAccessNode`
- [x] `astMemberAccess()` builder function
- [x] Parser produces MemberAccessNode for `a.b`
- [x] Left-associative: `a.b.c` = `MemberAccess(MemberAccess(a, b), c)`
- [x] Error for `1.x` (member access on number)
- [x] GRAMMAR.md updated with member access production
- [x] Unit tests in `src/expr/__tests__/parser.test.ts`

### Type Checker: Block Reference Resolution

- [x] `BlockReferenceContext` interface defined
- [x] `TypeCheckContext` extended with optional `blockRefs`
- [x] MemberAccessNode type checking implemented
- [x] Block name resolved via AddressRegistry.resolveAlias
- [x] Port name validated against block outputs
- [x] Payload type validated (float only for Expression)
- [x] Clear errors for: unknown block, unknown port, wrong type
- [x] Ambiguous displayName produces error
- [x] Unit tests in `src/expr/__tests__/typecheck.test.ts`

### Compiler: Block Reference Emission

- [x] `CompileContext.blockRefs` added (Map<string, SigExprId>)
- [x] MemberAccessNode compilation implemented
- [x] Looks up signal from blockRefs by alias
- [x] Internal error if signal not found (type checker should catch)
- [x] Unit tests in `src/expr/__tests__/compile.test.ts`

## Integration Verification

- [x] Full pipeline test: `Circle1.radius * 2` end-to-end
- [x] Expression block lowering provides blockRefs context
- [x] `npm run typecheck` passes
- [x] `npm run test` passes
- [x] Existing expression tests unchanged

## Documentation

- [x] GRAMMAR.md updated with member access rule
- [x] JSDoc on MemberAccessNode
- [x] JSDoc on BlockReferenceContext
- [x] JSDoc on TypeCheckContext.blockRefs
