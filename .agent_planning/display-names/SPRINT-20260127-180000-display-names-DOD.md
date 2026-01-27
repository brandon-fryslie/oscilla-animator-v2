# Definition of Done: display-names Sprint

**Generated**: 2026-01-27T18:00:00Z

## Functional Verification

### P0: Auto-generate displayName
- [ ] Create a new block → displayName is "<Type> 1" (e.g., "Oscillator 1")
- [ ] Create second same-type block → displayName is "<Type> 2"
- [ ] Create block when collision would occur → increments until unique
- [ ] `npm run typecheck` passes

### P1: Inline editing in ReactFlow
- [ ] Double-click node label → edit mode activates
- [ ] Type new name → Enter → name updates in node and inspector
- [ ] Type new name → click outside → name updates
- [ ] Escape → edit cancelled, original name restored
- [ ] Enter invalid name (collision) → shows error, doesn't save
- [ ] Visual feedback during edit (focus ring, cursor)

### P2: Validation integration
- [ ] Attempt collision via inspector → error shown
- [ ] Attempt collision via inline edit → error shown
- [ ] Load patch with collision → diagnostic warning emitted
- [ ] Validation uses canonical normalization (case-insensitive)

### P3: Type safety
- [ ] `Block.displayName` is `string` (not `string | null`)
- [ ] TypeScript compilation succeeds
- [ ] No runtime errors when creating/loading blocks
- [ ] Legacy patches with null displayName auto-migrate

## Technical Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all existing tests)
- [ ] `npm run build` succeeds
- [ ] New functionality has tests:
  - [ ] `generateDefaultDisplayName()` unit tests
  - [ ] Collision detection integration tests
  - [ ] OscillaNode inline edit behavior tests (optional - UI test)

## Code Quality

- [ ] No new TypeScript `any` types introduced
- [ ] Uses existing canonical-name.ts utilities (no duplication)
- [ ] Follows existing patterns (DisplayNameEditor in BlockInspector)
- [ ] Changes are minimal and focused

## Manual Testing Checklist

1. Start dev server (`npm run dev`)
2. Add blocks from library → verify auto-generated names
3. Double-click node label → verify edit works
4. Try to create collision → verify error handling
5. Edit name in inspector → verify node updates
6. Edit name in node → verify inspector updates
7. Reload page → verify names persist
