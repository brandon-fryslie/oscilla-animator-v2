# Sprint: display-names - User Editable Block Display Names

**Generated**: 2026-01-27T18:00:00Z
**Confidence**: HIGH: 4, MEDIUM: 0, LOW: 0
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Implement user-editable block display names with auto-generation on creation, inline editing in ReactFlow nodes, and collision validation using canonical-name.ts utilities.

## Scope

**Deliverables:**
1. Auto-generate displayName on block creation using pattern "<Type> <n>"
2. Inline displayName editing in ReactFlow nodes (OscillaNode)
3. Collision detection and validation integration
4. Type safety: displayName always has a value (non-null)

## Work Items

### P0: Auto-generate displayName on block creation [HIGH]

**File**: `src/stores/PatchStore.ts`

**Acceptance Criteria:**
- [ ] New blocks receive displayName `"<BlockDef.label> <n>"` where n = count of same-type blocks + 1
- [ ] Auto-generated names avoid collisions (increment n until unique)
- [ ] Uses `normalizeCanonicalName()` and `detectCanonicalNameCollisions()` from canonical-name.ts
- [ ] Works for both `PatchStore.addBlock()` and `PatchBuilder.addBlock()`

**Technical Notes:**
- Add helper function `generateDefaultDisplayName(type: string, existingBlocks: Map<BlockId, Block>): string`
- Count blocks where `blockType === type`
- Check canonical collision against ALL blocks, not just same type
- Modify `addBlock()` to call helper when `options?.displayName` not provided

### P1: Inline displayName editing in OscillaNode [HIGH]

**File**: `src/ui/reactFlowEditor/OscillaNode.tsx`

**Acceptance Criteria:**
- [ ] Double-click on node label enters edit mode
- [ ] Edit mode shows input field with current displayName
- [ ] Enter or blur commits change
- [ ] Escape cancels edit
- [ ] Validation error shown on collision (red border, tooltip)
- [ ] Empty input reverts to auto-generated name (not null)

**Technical Notes:**
- Follow same pattern as BlockInspector's DisplayNameEditor
- Use local state for edit mode: `useState<boolean>(false)`
- Use local state for edit value: `useState<string>('')`
- Call `patchStore.updateBlockDisplayName(blockId, newName)` on commit
- Validate with `detectCanonicalNameCollisions()` before commit

### P2: Validation integration [HIGH]

**Files**: `src/stores/PatchStore.ts`, `src/diagnostics/validators/authoringValidators.ts`

**Acceptance Criteria:**
- [ ] `updateBlockDisplayName()` validates uniqueness before applying
- [ ] Returns error if collision would occur (caller decides how to handle)
- [ ] Authoring validators warn on patches with collisions
- [ ] PatchBuilder validates in test scenarios

**Technical Notes:**
- Add validation check in `updateBlockDisplayName()` before mutation
- Consider: should we prevent the update or allow with warning?
- Recommendation: Allow update but emit diagnostic warning

### P3: Type safety - non-null displayName [HIGH]

**Files**: `src/graph/Patch.ts`, `src/stores/PatchStore.ts`, usage sites

**Acceptance Criteria:**
- [ ] `Block.displayName` type changed from `string | null` to `string`
- [ ] All code that checks for null displayName updated
- [ ] Fallback to blockDef.label removed (displayName always has value)
- [ ] PatchBuilder always requires/generates displayName

**Technical Notes:**
- This is a breaking change to the Patch type
- Migration: any null displayName becomes auto-generated
- Update `loadPatch()` to auto-generate for legacy patches with null

## Dependencies

None - all infrastructure exists.

## Risks

1. **Breaking legacy patches**: Mitigated by auto-generating on load
2. **Type change ripple effects**: Limited - most code already falls back to blockDef.label
