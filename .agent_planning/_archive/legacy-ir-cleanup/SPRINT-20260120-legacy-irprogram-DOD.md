# Definition of Done: Remove Legacy IRProgram

**Bead:** oscilla-animator-v2-8vo
**Sprint:** SPRINT-20260120-legacy-irprogram

## Acceptance Criteria

- [ ] `IRProgram` interface removed from `src/compiler/ir/types.ts`
- [ ] Deprecation header in `types.ts` updated to accurately describe file contents
- [ ] `IRProgram` removed from exports in:
  - [ ] `src/index.ts`
  - [ ] `src/compiler/index.ts`
- [ ] Comment in `src/compiler/ir/program.ts` updated (no reference to "legacy IRProgram")
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] `npm run test` passes
- [ ] No remaining `IRProgram` references in `src/` (verified by grep)

## Out of Scope

- Migrating expression types (SigExpr, FieldExpr, etc.) to other files
- Changing the runtime's use of these types
- Modifying CompiledProgramIR

## Verification Commands

```bash
npm run typecheck
npm run build
npm run test
grep -r "IRProgram" src/ --include="*.ts"
```
