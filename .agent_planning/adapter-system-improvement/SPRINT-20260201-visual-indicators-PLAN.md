# Sprint: visual-indicators - Edge Visualization & Lens Visual Indicators
Generated: 2026-02-01
Confidence: HIGH: 2, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-2026-02-01-195800.md

## Sprint Goal
Add visual indicators on edges that have lenses attached, extend PortInfoPopover to show lens params, and add tooltips to lens indicators on port handles.

## Scope
**Deliverables:**
- Edge labels/styling for edges whose target ports have lenses
- Tooltip enhancement on lens indicators (port handles)
- PortInfoPopover extension to show lens params when present
- Test coverage for lensUtils.ts functions

**Future Work (LOW confidence, not in this sprint):**
- Sprint C: Advanced Lens Editing -- double-click adapter indicator to edit params, keyboard shortcuts for lens management, parameterized lens editing UI. These require a selection model for adapter indicators and param editing UI components that don't exist yet. Research needed before planning.

## Work Items

### P1: Edge Visualization for Lensed Connections

**Dependencies**: None (Sprint 3 port indicators already complete)
**Spec Reference**: Sprint 4 DOD from original plan | **Status Reference**: EVALUATION-2026-02-01-195800.md "Sprint 4: Edge Visualization"

#### Description
When an edge connects to a port that has lenses, the edge should be visually distinct. Currently `createEdgeFromPatchEdge()` in `src/ui/reactFlowEditor/nodes.ts` only checks for auto-inserted adapters (type mismatches) via `findAdapter()`. It does not check for user-attached lenses on the target port.

The implementation must:
1. Check if the target port of an edge has lenses attached
2. If yes, style the edge with amber color and a label showing the lens type(s)
3. This is in addition to the existing adapter detection (which handles auto-inserted type conversion)

The `createEdgeFromPatchEdge` function already receives `blocks` context. It needs to also receive the target block's inputPort data to check for lenses.

#### Acceptance Criteria
- [ ] Edges targeting a port with lenses display amber styling (stroke color `#f59e0b`)
- [ ] Edge label shows lens type name(s) when lenses are present
- [ ] Existing adapter edge styling (type mismatch) is preserved and not broken
- [ ] When both auto-adapter AND user lens exist, both are shown (lens takes visual priority)
- [ ] Edges to ports without lenses are unchanged

#### Technical Notes
- `createEdgeFromPatchEdge()` at line 328 of nodes.ts is the function to modify
- It already receives `blocks?: ReadonlyMap<BlockId, Block>` -- use this to look up target port lenses
- Pattern to follow: the existing adapter detection block at lines 351-369
- Import `getLensLabel` from `./lensUtils` for human-readable lens names
- Edge label for lenses: e.g., "Deg->Rad" or lens label from registry

---

### P1: Add Test Coverage for lensUtils.ts

**Dependencies**: None
**Spec Reference**: N/A (test coverage gap) | **Status Reference**: EVALUATION-2026-02-01-195800.md "Missing Checks" and "Sprint 3: Lens Utilities" issue 3

#### Description
`src/ui/reactFlowEditor/lensUtils.ts` has zero test coverage. The functions `getAvailableLensTypes()`, `getLensLabel()`, `canApplyLens()`, and `findCompatibleLenses()` all need tests. These are used by context menus and will be used by edge visualization.

#### Acceptance Criteria
- [ ] New test file: `src/ui/reactFlowEditor/__tests__/lensUtils.test.ts`
- [ ] Tests for `getAvailableLensTypes()`: returns array, items have required fields, sorted by label
- [ ] Tests for `getLensLabel()`: known type returns label, unknown type returns formatted fallback
- [ ] Tests for `canApplyLens()`: matching types return true, mismatched types return false
- [ ] Tests for `findCompatibleLenses()`: returns only compatible lenses for given source/target types
- [ ] All tests pass

#### Technical Notes
- Follow the existing test pattern in `src/ui/reactFlowEditor/` (if any) or `src/blocks/__tests__/`
- Tests will need block registry initialized (adapter blocks registered) -- use the same setup as adapter-spec tests
- `typesMatch()` is not exported but tested indirectly through `canApplyLens()`

---

### P2: PortInfoPopover Lens Params Display

**Dependencies**: None
**Spec Reference**: Sprint 3 DOD line 87 | **Status Reference**: EVALUATION-2026-02-01-195800.md "Sprint 3: PortInfoPopover" issue

#### Description
The PortInfoPopover at `src/ui/reactFlowEditor/PortInfoPopover.tsx:295-308` shows lens type and abbreviated source address, but does NOT show lens params even when present. The Sprint 3 DOD specified "Shows params if present". This is a minor gap.

#### Acceptance Criteria
- [ ] When a lens has `params` (non-empty object), the params are displayed in the popover
- [ ] Params display uses a compact key-value format (e.g., "scale: 0.5")
- [ ] When params is undefined or empty, no params section is shown (no visual change from current)
- [ ] Popover layout is not broken by long param values

#### Technical Notes
- File: `src/ui/reactFlowEditor/PortInfoPopover.tsx` lines 295-314
- Current lens rendering is inside a `Stack` with `Badge` and `Text` components (Mantine)
- Add params display after the sourceAddress text, conditionally:
```tsx
{lens.params && Object.keys(lens.params).length > 0 && (
  <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
    {Object.entries(lens.params).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}
  </Text>
)}
```

#### Unknowns to Resolve
1. What param types are actually used? Currently only `Record<string, unknown>` exists. Need to verify if any adapter blocks actually use params today.

---

### P2: Lens Indicator Tooltip Enhancement

**Dependencies**: None
**Spec Reference**: Sprint 4 DOD | **Status Reference**: EVALUATION-2026-02-01-195800.md "Sprint 3: Port Visual Indicators"

#### Description
The current lens indicator on port handles (amber badge in OscillaNode.tsx:235-256) shows a generic tooltip like "1 lens attached" or "2 lenses attached". Enhance this to show the actual lens type names in the tooltip.

#### Acceptance Criteria
- [ ] Tooltip shows lens type names (e.g., "Lenses: Degrees to Radians")
- [ ] Multiple lenses show each name on its own line or comma-separated
- [ ] Single lens shows just the name without count
- [ ] Tooltip text is readable and not truncated

#### Technical Notes
- File: `src/ui/reactFlowEditor/OscillaNode.tsx` line 254
- Current: `title={\`${input.lensCount} lens${input.lensCount > 1 ? 'es' : ''} attached\`}`
- The `input` object (PortData) already has `lenses?: readonly LensAttachment[]`
- Import `getLensLabel` from `./lensUtils`
- New title: `input.lenses?.map(l => getLensLabel(l.lensType)).join(', ')` or similar

#### Unknowns to Resolve
1. Should the tooltip also show sourceAddress info? Probably not for the indicator -- the popover already shows it.

## Dependencies
- Sprint A (quality-fixes) should be done first to ensure the sourceAddress matching is correct before building edge visualization that depends on lens data
- All items within this sprint are independent of each other

## Risks
- Edge visualization may need performance consideration if many edges have lenses (ReactFlow re-renders edges on data change)
- The `createEdgeFromPatchEdge` function signature may need an additional parameter, which would require updating all call sites in sync.ts
