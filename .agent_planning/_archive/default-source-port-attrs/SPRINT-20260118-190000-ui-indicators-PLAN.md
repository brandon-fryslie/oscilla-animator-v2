# Sprint: ui-indicators - Default Source Port Visual Indicators

Generated: 2026-01-18T19:00:00
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Add visual indicators on input ports that have default sources, showing the default kind (constant/rail/none) without rendering separate blocks in the patch editor.

## Scope

**Deliverables:**
- Visual indicator on input ports showing default source type
- Tooltip/hover showing default value
- Hide derived `_ds_*` blocks from UI (if they appear)

## Work Items

### P0: Port Default Indicator in OscillaNode

**Files**: `src/ui/reactFlowEditor/OscillaNode.tsx`

**Acceptance Criteria:**
- [ ] Input ports with `defaultSource: { kind: 'constant' }` show a small dot/badge
- [ ] Input ports with `defaultSource: { kind: 'rail' }` show a different indicator (rail icon)
- [ ] Input ports with `defaultSource: { kind: 'none' }` show no indicator
- [ ] Indicator colors/icons distinguish constant vs rail

**Technical Notes:**
- Read `defaultSource` from block registry via `getBlockDefinition()`
- Use CSS pseudo-elements or small React component for indicator
- Keep indicator unobtrusive (small, subtle)

### P1: Hover Tooltip for Default Value

**Files**: `src/ui/reactFlowEditor/OscillaNode.tsx`

**Acceptance Criteria:**
- [ ] Hovering port with default shows tooltip
- [ ] Tooltip shows: "Default: {value}" for constants
- [ ] Tooltip shows: "Default: {railId} rail" for rails
- [ ] No tooltip for `kind: 'none'`

**Technical Notes:**
- Use existing tooltip system or simple title attribute
- Format values appropriately (numbers, colors, etc.)

### P2: Filter Derived Blocks from UI (if needed)

**Files**: `src/ui/reactFlowEditor/sync.ts`

**Acceptance Criteria:**
- [ ] Blocks with `role.kind === 'derived'` and `meta.kind === 'defaultSource'` are not rendered
- [ ] Edges to/from these blocks are not rendered
- [ ] No visual artifacts from missing blocks

**Technical Notes:**
- Check if pass1 is currently called in editor context
- If derived blocks already don't appear, this is a no-op
- Add explicit filter if needed for safety

## Dependencies

- Block registry with `defaultSource` on `InputDef` (already exists)
- OscillaNode port rendering (already exists)

## Risks

- **Low**: Indicator design may need iteration for clarity
- **Low**: Tooltip may need better formatting for complex values

## Verification

1. Add a block with constant default (e.g., GridLayout)
2. Verify port shows indicator
3. Hover and verify tooltip shows value
4. Connect an edge to that port
5. Verify indicator behavior (should still show default exists)
