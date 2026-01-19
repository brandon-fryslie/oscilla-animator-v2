# Definition of Done: Remove inputDefaults System

Sprint: inputdefaults-removal
Generated: 2026-01-19

---

## P0: Remove inputDefaults Field

- [ ] `inputDefaults` field removed from Block interface in `src/graph/Patch.ts`
- [ ] `inputDefaults` option removed from PatchBuilder.addBlock options type
- [ ] `inputDefaults` assignment removed from PatchBuilder.addBlock implementation
- [ ] TypeScript compiles with zero errors after removal

## P1: Remove inputDefaults Logic

- [ ] `src/graph/passes/pass1-default-sources.ts` does NOT check `block.inputDefaults`
- [ ] Pass1 only uses registry defaults (BlockSpec.inputs[].defaultSource)
- [ ] `src/stores/PatchStore.ts` does NOT reference `inputDefaults`
- [ ] `src/ui/reactFlowEditor/nodes.ts` does NOT check `block.inputDefaults`

## P2: Fix Demo Patches

- [ ] `src/main.ts` has ZERO occurrences of `inputDefaults`
- [ ] All demo patches use one of:
  - Registry defaults (no override needed)
  - Explicit Const blocks wired to inputs (if specific value needed)
- [ ] Demo patches compile without errors
- [ ] Demo patches run and display animation

## P3: Verify Correct Architecture

- [ ] Editing block param in inspector → recompile → visual output changes
- [ ] Unconnected inputs receive DefaultSource blocks during normalization
- [ ] DefaultSource blocks read values from block.params (not hardcoded)

## P4: Codebase Verification

- [ ] `grep -r "inputDefaults" src/` returns ZERO results
- [ ] All unit tests pass (`npm run test`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)

## P5: UI Visual Differentiation (Original Request)

- [ ] Ports using default sources are visually distinct in the graph editor
- [ ] Visual indicator does not clutter the UI
- [ ] Indicator correctly shows only for default edges (role: 'default')

---

## NOT Done If:

- Any occurrence of `inputDefaults` remains in src/
- Block params edits don't affect visual output
- Demo patches use hardcoded values that bypass params
- Type errors exist
- Tests fail
