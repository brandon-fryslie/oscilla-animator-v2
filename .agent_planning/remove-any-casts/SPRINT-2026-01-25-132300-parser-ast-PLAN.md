# Sprint: Parser AST Type Narrowing

**Generated:** 2026-01-25T13:23:00Z
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Estimated effort:** 45 minutes

## Sprint Goal

Replace ~48 'as any' casts for parser AST node property access with proper type narrowing and assertion helpers.

## Scope

**Deliverables:**
- Remove all `(ast as any).value`, `(ast as any).op`, `(ast as any).left` casts
- Implement type narrowing patterns based on AST node discriminant
- Create assertion helpers for common AST patterns if needed
- Maintain test logic without breaking existing assertions

**Files affected:**
- `src/__tests__/parser.test.ts`

## Work Items

### P0: Implement AST type narrowing patterns
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] Identify all unique AST node types and their discriminant field
- [ ] Create type narrowing helper functions or guards for AST nodes
- [ ] Replace all `(ast as any).property` with properly typed access
- [ ] Tests pass without regression
- [ ] Type assertions are compiler-verifiable (not runtime casts)

**Technical Notes:**
- Parser returns a discriminated union type (likely `ExprAST = LiteralExpr | BinaryExpr | UnaryExpr | ...`)
- Each node type has a discriminant field (e.g., `kind`, `type`, `op`) to narrow the union
- Instead of `(ast as any).value`, use: `if (ast.kind === 'literal') { ast.value }`
- Consider creating assertion helper: `assertLiteral(ast): ast is LiteralExpr`

## Dependencies

- None - parser tests are independent

## Risks

- **Medium:** May require understanding parser AST structure
- **Medium:** Test logic may need restructuring to enable proper narrowing
- **Mitigation:** Read parser.ts to understand union type structure first

## Implementation Sequence

1. Read parser.ts to understand AST type definitions
2. Identify discriminant field for each node type
3. Create type narrowing helpers if beneficial (reduces duplication)
4. Update parser.test.ts to use narrowing patterns
5. Run parser tests to verify correctness
6. Consider if helpers should be extracted to shared test utility

## Stretch Goal

If AST narrowing patterns emerge, extract common helpers to a shared parser test utility file to promote reuse across other tests.
