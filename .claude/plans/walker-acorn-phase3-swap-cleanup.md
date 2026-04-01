# Phase 3: Swap and Clean Up

## Goal
Delete the old TS-compiler walker, rename the acorn walker to take its place, verify no runtime `typescript` import remains in render code, and confirm bundle size drop.

## Context
Depends on Phase 2 completion (walker-acorn.ts created and passing all tests including dual-walker equivalence). This phase is the cutover — delete old, rename new, verify everything still works.

## Upstream Contracts — What Phase 2 Provides

This phase depends on Phase 2 having created these exact artifacts:

- `src/render/gpu-ir/walker-acorn.ts` — exports `compileShaderBody`, `ShaderStage`, `ShaderContext`, `WalkerDiagnostic`, `WalkerResult`
- `src/render/gpu-ir/__tests__/walker-acorn.test.ts` — contains unit tests (keep) + a `describe('dual-walker equivalence', ...)` block (delete)
- `src/render/gpu-ir/compile.ts` — imports from `'./walker-acorn'` (change to `'./walker'`)
- `src/render/gpu-ir/walker.ts` — old TS-compiler walker (delete)

## Steps

### Step 10 — Delete and rename
1. Delete `src/render/gpu-ir/walker.ts` (old TS-compiler walker)
2. Rename `walker-acorn.ts` → `walker.ts`
3. Update import in `compile.ts` to `'./walker'`
4. Delete dual-walker equivalence test from test file
5. Rename `walker-acorn.test.ts` → `walker.test.ts` (keep all unit tests)

### Step 11 — Verify
```bash
npm run typecheck && npm run test && npm run build
```

Post-verification checks:
- Grep `import ts from 'typescript'` in `src/render/` → **0 matches**
- `typescript` stays as devDependency (used by tsc for type checking)
- Check payload-tester bundle size drop (should lose ~3MB of typescript runtime)

## Verification Checklist
- [ ] `npm run typecheck` — no type errors
- [ ] `npm run test` — all tests pass
- [ ] `npm run build` — builds successfully
- [ ] No `import ts from 'typescript'` in `src/render/` after cleanup
- [ ] `typescript` remains as devDependency only
- [ ] Bundle size visibly reduced (no typescript runtime in render code)

## Files Modified

| File | Action |
|------|--------|
| `src/render/gpu-ir/walker.ts` | **DELETE** (old TS walker) then **RENAME** walker-acorn.ts → walker.ts |
| `src/render/gpu-ir/walker-acorn.ts` | **RENAME** → `walker.ts` |
| `src/render/gpu-ir/__tests__/walker-acorn.test.ts` | **RENAME** → `walker.test.ts`, delete dual-walker equivalence test |
| `src/render/gpu-ir/compile.ts` | **MODIFY** — update import path to `'./walker'` |
