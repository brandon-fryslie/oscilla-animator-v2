# Sprint: patch-format - Default Sources as Patch Port Attributes

Generated: 2026-01-18T19:10:00
Updated: 2026-01-18T19:20:00 (after research)
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Add port-level default source attributes to the Block type, enabling per-instance default customization. Pass1 will read from block instance first, then fall back to registry.

## Research Findings

### Current Architecture

1. **Block Type** (`src/graph/Patch.ts`):
   - Block has: `id`, `type`, `params`, `displayName`, `domainId`, `role`
   - NO port-level data - ports come from block definitions only

2. **Serialization**: None yet
   - Patches are built programmatically in `main.ts`
   - `PatchStore.loadPatch()` accepts a `Patch` object
   - No JSON serialization to disk

3. **Pass1** (`src/graph/passes/pass1-default-sources.ts`):
   - Reads `InputDef.defaultSource` from registry
   - Generates `_ds_${blockId}_${portId}` blocks
   - Creates edges from derived blocks to target ports

4. **UI** (`src/ui/reactFlowEditor/`):
   - `OscillaNode.tsx` renders handles for inputs/outputs
   - `nodes.ts` maps block definition inputs to `OscillaNodeData`
   - Currently only shows `{ id, label }` for each port

## Scope

**Deliverables:**
1. Add `inputDefaults?: Record<string, DefaultSource>` to Block type
2. Modify pass1 to check block instance before registry
3. Add method to PatchStore to update input defaults
4. Update UI to show default indicators on ports

## Work Items

### P0: Add inputDefaults to Block Type

**Files**: `src/graph/Patch.ts`

**Acceptance Criteria:**
- [ ] Block interface has optional `inputDefaults?: Record<string, DefaultSource>`
- [ ] Type exports updated
- [ ] PatchBuilder updated to accept input defaults

**Technical Notes:**
```typescript
export interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  readonly displayName: string | null;
  readonly domainId: string | null;
  readonly role: BlockRole;
  readonly inputDefaults?: Readonly<Record<string, DefaultSource>>;  // NEW
}
```

### P1: Modify Pass1 to Check Instance Defaults

**Files**: `src/graph/passes/pass1-default-sources.ts`

**Acceptance Criteria:**
- [ ] Pass1 checks `block.inputDefaults[input.id]` first
- [ ] Falls back to `input.defaultSource` from registry if not set
- [ ] Derived block created correctly from either source
- [ ] Existing behavior unchanged when no instance defaults

**Technical Notes:**
```typescript
function getDefaultSourceForInput(block: Block, input: InputDef): DefaultSource | undefined {
  // Check instance override first
  const override = block.inputDefaults?.[input.id];
  if (override) return override;

  // Fall back to registry
  return (input as InputDef & { defaultSource?: DefaultSource }).defaultSource;
}
```

### P2: Add PatchStore Method for Input Defaults

**Files**: `src/stores/PatchStore.ts`

**Acceptance Criteria:**
- [ ] `updateBlockInputDefault(blockId, inputId, defaultSource)` method added
- [ ] Method is a MobX action
- [ ] Correctly updates block with new default
- [ ] Can clear default (set to undefined to use registry default)

**Technical Notes:**
```typescript
updateBlockInputDefault(
  blockId: BlockId,
  inputId: string,
  defaultSource: DefaultSource | undefined
): void {
  const block = this._data.blocks.get(blockId);
  if (!block) throw new Error(`Block not found: ${blockId}`);

  const newDefaults = { ...block.inputDefaults };
  if (defaultSource) {
    newDefaults[inputId] = defaultSource;
  } else {
    delete newDefaults[inputId];
  }

  this._data.blocks.set(blockId, {
    ...block,
    inputDefaults: Object.keys(newDefaults).length > 0 ? newDefaults : undefined,
  });
}
```

### P3: Update UI to Show Default Indicators

**Files**:
- `src/ui/reactFlowEditor/nodes.ts` - Add defaultSource to port data
- `src/ui/reactFlowEditor/OscillaNode.tsx` - Render indicator

**Acceptance Criteria:**
- [ ] `OscillaNodeData.inputs` includes defaultSource info
- [ ] Input handles show indicator when default exists
- [ ] Tooltip shows default value on hover
- [ ] Different visual for constant vs rail defaults

**Technical Notes:**
```typescript
// In nodes.ts
inputs: blockDef.inputs.map((input) => ({
  id: input.id,
  label: input.label,
  defaultSource: block.inputDefaults?.[input.id] ?? input.defaultSource,
})),

// In OscillaNode.tsx - add indicator after Handle
{input.defaultSource && input.defaultSource.kind !== 'none' && (
  <span
    className={`default-indicator default-indicator--${input.defaultSource.kind}`}
    title={formatDefaultSource(input.defaultSource)}
  />
)}
```

## Dependencies

- DefaultSource type already exists in `src/types/index.ts`
- Block registry structure is stable

## Risks

- **Low**: Existing patches may need explicit handling (but currently no serialization)
- **Low**: UI indicator styling may need iteration

## Verification

1. Build succeeds with new Block type
2. Add block to patch via PatchStore
3. Call `updateBlockInputDefault()` to set custom default
4. Compile patch - verify pass1 uses instance default
5. Check UI shows indicator on port

## Exit Criteria

- [ ] All work items completed
- [ ] No TypeScript errors
- [ ] Pass1 correctly prioritizes instance defaults
- [ ] UI shows default indicators
