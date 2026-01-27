# Definition of Done: typeenv-removal

**Sprint**: Remove TypeEnv Legacy Pattern
**Bead ID**: oscilla-animator-v2-6n6

## Completion Criteria

### Code Changes

- [ ] `src/expr/index.ts`:
  - [ ] No import of `TypeEnv`
  - [ ] `extractPayloadTypes()` returns `ReadonlyMap<string, PayloadType>` (not `TypeEnv`)
  - [ ] `typecheck()` called with `{ inputs: inputTypes }`
  - [ ] No re-export of `TypeEnv`

- [ ] `src/expr/typecheck.ts`:
  - [ ] Only one `typecheck()` signature (not overloaded)
  - [ ] Signature is `typecheck(node: ExprNode, ctx: TypeCheckContext): ExprNode`
  - [ ] No `isTypeEnv()` function
  - [ ] No union type `TypeCheckContext | TypeEnv`
  - [ ] `TypeEnv` type alias remains (used internally by `TypeCheckContext.inputs`)

- [ ] `src/expr/__tests__/typecheck.test.ts`:
  - [ ] All test cases use `{ inputs: map }` pattern
  - [ ] No direct `Map` passed to `typecheck()`

### Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all tests green)
- [ ] `npm run build` succeeds
- [ ] Grep for `TypeEnv` shows:
  - Definition in typecheck.ts
  - Usage as `inputs` field type in TypeCheckContext
  - NO public exports
  - NO overloaded signatures
  - NO type guards

### Documentation

- [ ] JSDoc updated on `typecheck()` function (remove deprecated notice)

## Out of Scope

- `TypeEnv` type alias removal (still useful internally for `TypeCheckContext.inputs`)
- Changes to `TypeCheckContext` interface
- Changes to block reference handling
