# Definition of Done: Complete inputDefaults Removal

Sprint: inputdefaults-removal-complete
Generated: 2026-01-19

---

## P0: Registry Defaults Complete

- [ ] `src/blocks/color-blocks.ts`: HsvToRgb `sat` input has `defaultSource: defaultSourceConstant(1.0)`
- [ ] `src/blocks/color-blocks.ts`: HsvToRgb `val` input has `defaultSource: defaultSourceConstant(1.0)`
- [ ] `src/blocks/field-operations-blocks.ts`: FieldRadiusSqrt `radius` input has `defaultSource: defaultSourceConstant(0.35)`
- [ ] `src/blocks/render-blocks.ts`: RenderInstances2D `size` input has `defaultSource: defaultSourceConstant(5)`
- [ ] `src/blocks/render-blocks.ts`: RenderCircle `size` input has `defaultSource: defaultSourceConstant(5)`
- [ ] `src/blocks/render-blocks.ts`: RenderRect `width` input has `defaultSource: defaultSourceConstant(10)`
- [ ] `src/blocks/render-blocks.ts`: RenderRect `height` input has `defaultSource: defaultSourceConstant(10)`
- [ ] TypeScript compiles with zero errors after additions

## P1: Type System Clean

- [ ] `inputDefaults` field removed from Block interface in `src/graph/Patch.ts`
- [ ] `inputDefaults` option removed from PatchBuilder.addBlock options type
- [ ] `inputDefaults` assignment removed from PatchBuilder.addBlock implementation

## P2: Logic Removed

- [ ] `src/graph/passes/pass1-default-sources.ts` does NOT check `block.inputDefaults`
- [ ] Pass1 only uses registry defaults (input.defaultSource from BlockSpec)
- [ ] `src/stores/PatchStore.ts` does NOT reference `inputDefaults`
- [ ] `src/ui/reactFlowEditor/nodes.ts` does NOT check `block.inputDefaults`

## P3: Demo Patches Fixed

- [ ] `src/main.ts` has ZERO occurrences of `inputDefaults`
- [ ] All demo patches use either:
  - Registry defaults (no override needed)
  - Explicit Const blocks wired to inputs (if specific value needed)
- [ ] Demo patches compile without errors

## P4: Codebase Verification

- [ ] `grep -r "inputDefaults" src/` returns ZERO results
- [ ] `npm run typecheck` passes with ZERO errors
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds

## P5: End-to-End Verification

- [ ] Demo patches run and display animation correctly
- [ ] Editing block param in inspector → recompile → visual output changes
- [ ] DefaultSource blocks are created during normalization
- [ ] Default edges have proper role for UI differentiation (future P6)

---

## NOT Done If:

- Any occurrence of `inputDefaults` remains in src/
- Any input used in demo patches lacks a registry defaultSource
- Block params edits don't affect visual output
- Type errors exist
- Tests fail
- Demo animation doesn't display

---

## Supersedes

- `SPRINT-20260119-inputdefaults-removal-DOD.md` (incomplete)
