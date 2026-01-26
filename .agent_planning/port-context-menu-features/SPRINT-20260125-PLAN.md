# Port Context Menu Features Plan

**Created:** 2026-01-25
**Feature:** Enhanced port context menu with quick connect, combine mode cycling, and "add block from port"

## Summary

Enhance the existing `PortContextMenu` component to add three new features:
1. **Quick Connect** - Show 3 compatible ports to connect to (randomly selected)
2. **Combine Mode Cycling** - "Combine: Sum >" menu item that cycles through valid combine modes
3. **Add Block From Port** - Add a new block that auto-positions next to the port and connects

## Current State Analysis

### Existing Infrastructure
- `PortContextMenu.tsx` - Basic port menu with Disconnect / Reset to Default
- `PortHighlightStore.ts` - Already computes `compatiblePorts` via `validateConnection()`
- `sync.ts` - Has `findSmartPosition()` for block placement and `addBlockToReactFlow()`
- `PatchStore` - Has `addBlock()` and `addEdge()` actions
- `LayoutStore` - Owns node positions
- `CombineMode` type - 10 modes: last, first, sum, average, max, min, mul, layer, or, and
- Combine modes are stored on **InputPort** not on Edge (per-port setting)

### Key Files
- `src/ui/reactFlowEditor/menus/PortContextMenu.tsx` - Main file to modify
- `src/stores/PortHighlightStore.ts` - Has compatible port computation
- `src/ui/reactFlowEditor/sync.ts` - Has positioning logic
- `src/stores/PatchStore.ts` - Graph mutations
- `src/types/index.ts` - CombineMode type and category mapping

## Implementation Plan

### Step 1: Extend PortContextMenu Props & State

Add new props to PortContextMenu:
- `onNavigateToBlock?: (blockId: BlockId) => void` - For "Go to" after connecting
- Access to `LayoutStore` via `useStores()` (already available)

### Step 2: Quick Connect Feature (Input Ports)

**For input ports:**
1. Use `PortHighlightStore.compatiblePorts` pattern to find compatible **output** ports
2. Filter to ports that are actually sources (output ports from other blocks)
3. Randomly select up to 3 compatible ports
4. Create menu items: "Connect to [BlockLabel].[PortId]" with cable icon
5. On click: Call `patch.addEdge()` to create the connection

**For output ports:**
1. Find compatible **input** ports on other blocks
2. Same pattern - show up to 3 options
3. On click: Create edge from this output to selected input

**Implementation:**
```typescript
// Compute compatible ports using the same logic as PortHighlightStore
function getCompatiblePorts(
  patch: Patch,
  blockId: BlockId,
  portId: PortId,
  isInput: boolean
): Array<{blockId: BlockId, portId: PortId, blockLabel: string}> {
  // Similar to PortHighlightStore.compatiblePorts computed getter
  // Returns opposite direction ports that pass validateConnection()
}
```

### Step 3: Combine Mode Cycling (Input Ports Only)

**Design:**
- Menu item: "Combine: Sum ›" (or current mode)
- Click cycles to next valid mode for this port's type
- Only show for input ports (combine modes are per-input-port)

**Current State:** Looking at the codebase, combine modes appear to be stored at the input port level but the InputPort interface doesn't have a `combineMode` field. Need to verify where this is stored.

**Investigation needed:** Check if combine mode is:
- On `InputPort` in Patch.ts
- On the Edge
- Somewhere in block params

**From `src/types/index.ts`:**
- `COMBINE_MODE_CATEGORY` maps modes to 'numeric', 'any', or 'boolean'
- Need to filter valid modes based on port's payload type

**Implementation:**
```typescript
// Get valid combine modes for a port based on its payload type
function getValidCombineModes(payloadType: PayloadType): CombineMode[] {
  const category = payloadType === 'bool' ? 'boolean'
                 : ['float', 'int', 'vec2', 'vec3', 'color'].includes(payloadType) ? 'numeric'
                 : 'any';

  return Object.entries(COMBINE_MODE_CATEGORY)
    .filter(([_, cat]) => cat === 'any' || cat === category)
    .map(([mode]) => mode as CombineMode);
}
```

**Data Model Update Needed:**
The `InputPort` interface in `Patch.ts` needs a `combineMode` field, and `PatchStore` needs an action to update it.

### Step 4: Add Block From Port

**For output ports:**
1. Show "Add Block..." submenu or direct items
2. Filter block registry to blocks that have compatible inputs
3. Show top 3-5 most relevant block types
4. On selection:
   - Create block via `patch.addBlock()`
   - Position it to the RIGHT of current block (output → downstream)
   - Create edge from this output to new block's compatible input
   - Select the new block

**For input ports:**
1. Show blocks that have compatible outputs
2. Position new block to the LEFT of current block (upstream → input)
3. Create edge from new block's output to this input

**Positioning Logic:**
```typescript
// Position new block relative to port's block
function positionBlockFromPort(
  existingBlockPos: NodePosition,
  isInput: boolean
): NodePosition {
  const NODE_WIDTH = 200;
  const GAP = 80;

  if (isInput) {
    // Place new block to the LEFT (upstream)
    return { x: existingBlockPos.x - NODE_WIDTH - GAP, y: existingBlockPos.y };
  } else {
    // Place new block to the RIGHT (downstream)
    return { x: existingBlockPos.x + NODE_WIDTH + GAP, y: existingBlockPos.y };
  }
}
```

### Step 5: Menu Structure

**Input Port Menu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━
Connect to Sin.out          🔗
Connect to Const.out        🔗
Connect to Time.ms          🔗
─────────────────────────────
Combine: Sum ›              ↻
─────────────────────────────
Add Sin →                   +
Add Const →                 +
Add Time →                  +
─────────────────────────────
Disconnect                  ✕
Reset to Default            ↺
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output Port Menu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━
Connect to Add.a            🔗
Connect to Mul.a            🔗
Connect to Render.value     🔗
─────────────────────────────
Add Add →                   +
Add Mul →                   +
Add Render →                +
─────────────────────────────
Disconnect All (3)          ✕
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Data Model Changes Required

### 1. Add `combineMode` to InputPort

In `src/graph/Patch.ts`:
```typescript
export interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
  readonly combineMode?: CombineMode;  // NEW: default is 'last'
}
```

### 2. Add PatchStore action

In `src/stores/PatchStore.ts`:
```typescript
updateInputPortCombineMode(blockId: BlockId, portId: PortId, mode: CombineMode): void {
  // Update the port's combine mode
}
```

### 3. Update Compiler to Read combineMode

In `src/compiler/passes-v2/resolveWriters.ts`:
The `resolveCombinePolicy()` function currently always returns default 'last'. Need to:
1. Accept the Block and portId as additional parameters
2. Read `combineMode` from the block's InputPort in the Patch
3. Return that mode instead of hardcoded default

```typescript
// Current (always returns 'last'):
export function resolveCombinePolicy(_input: InputDef): CombinePolicy {
  return getDefaultCombinePolicy();
}

// New (reads from InputPort):
export function resolveCombinePolicy(
  inputDef: InputDef,
  block: Block,
  portId: string
): CombinePolicy {
  const inputPort = block.inputPorts.get(portId);
  const mode = inputPort?.combineMode ?? 'last';
  return { when: 'multi', mode };
}
```

### 4. Update PatchBuilder

In `src/graph/Patch.ts`, update `PatchBuilder.addBlock()` to support combineMode in InputPort creation.

## Files to Modify

1. **`src/graph/Patch.ts`** - Add `combineMode` to InputPort interface + PatchBuilder
2. **`src/stores/PatchStore.ts`** - Add `updateInputPortCombineMode()` action
3. **`src/compiler/passes-v2/resolveWriters.ts`** - Read combineMode from InputPort
4. **`src/ui/reactFlowEditor/menus/PortContextMenu.tsx`** - Main UI implementation
5. **`src/types/index.ts`** - May need helper functions for valid modes

## Files to Create

None - all changes are in existing files.

## Test Plan

1. **Quick Connect:**
   - Right-click input port → shows compatible output ports
   - Right-click output port → shows compatible input ports
   - Click connection creates edge
   - Verify type validation (incompatible ports not shown)

2. **Combine Mode:**
   - Only appears for input ports
   - Shows current mode
   - Click cycles through valid modes for port type
   - Boolean ports: only show boolean-compatible modes
   - Numeric ports: show numeric + any modes
   - Verify mode persists and affects runtime

3. **Add Block:**
   - Shows relevant block types based on port type
   - New block positions correctly (left for input, right for output)
   - Edge created automatically
   - New block selected after creation

## Dependencies & Risks

**Dependencies:**
- Need to verify where combine modes are actually stored/used in compilation
- May need to update compiler to read combineMode from InputPort

**Risks:**
- Combine mode data model change could affect serialization
- Need to ensure backwards compatibility for patches without combineMode

## Verification Criteria

1. Can right-click any port and see enhanced menu
2. Can connect ports via context menu
3. Can cycle combine modes on input ports
4. Can add new blocks that auto-connect
5. All features work with type validation (no invalid connections)
6. No console errors or warnings
7. Undo/redo works with all new actions

## Open Questions

1. ~~**Combine mode storage:** Verify the compile pipeline reads combineMode.~~
   **RESOLVED:** Currently `resolveCombinePolicy()` in `resolveWriters.ts` always returns 'last'. Need to update it to read from InputPort.combineMode.

2. **Random vs smart selection:** For "Connect to" options, should we:
   - Random 3 from compatible (simpler)
   - Prioritize by relevance/distance (smarter but more complex)
   - **Decision:** Start with random, can improve later

3. **Block selection for "Add Block":** How to pick which blocks to show?
   - Filter by compatible type
   - Prioritize commonly used blocks
   - Could show a submenu with categories
   - **Decision:** Start with 3 random compatible blocks, can add submenu later

## Phased Implementation

### Phase 1: Quick Connect (Simplest)
- Add compatible port lookup to PortContextMenu
- Show 3 random compatible ports as menu items
- Create edge on click
- No data model changes needed

### Phase 2: Combine Mode Cycling
- Add `combineMode` to InputPort interface in Patch.ts
- Add `updateInputPortCombineMode()` to PatchStore
- Update compiler's `resolveCombinePolicy()` to read from InputPort
- Add UI menu item with cycling behavior

### Phase 3: Add Block From Port
- Compute compatible block types from registry
- Position calculation (left of input, right of output)
- Create block + edge in single action
- Select new block after creation
