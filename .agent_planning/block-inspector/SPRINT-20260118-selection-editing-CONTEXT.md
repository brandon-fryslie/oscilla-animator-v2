# Implementation Context: selection-editing

**Sprint:** Selection Wiring & Basic Param Editing
**Generated:** 2026-01-18

## Key Files

### Must Modify

**`src/ui/reactFlowEditor/ReactFlowEditor.tsx`**
- Add `onNodeClick` handler to sync selection
- Add `onPaneClick` handler to clear selection
- Import `BlockId` type if not present

**`src/ui/components/BlockInspector.tsx`**
- Replace JSON config display with per-param editors
- Add displayName edit field
- Create or import ParamField component

### May Create (optional)

**`src/ui/components/inspector/ParamField.tsx`** (optional)
- Generic param editor component
- Switches on param type (number, string, boolean, etc.)
- Could be inline in BlockInspector instead

## Architecture Reference

### Store Pattern

```typescript
// Selection is ID-based (ONE SOURCE OF TRUTH)
rootStore.selection.selectBlock(id: BlockId | null): void
rootStore.selection.clearSelection(): void

// Editing uses PatchStore actions
rootStore.patch.updateBlockParams(id: BlockId, params: Partial<...>): void
rootStore.patch.updateBlockDisplayName(id: BlockId, name: string | null): void
```

### Block Structure

```typescript
interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  readonly displayName: string | null;  // user-editable
  // ... other fields
}
```

### Const Block Params

```typescript
// From signal-blocks.ts
params: {
  value: 0,              // The constant value (number initially)
  // payloadType: set by normalizer (float, int, bool, phase, etc.)
}
```

The `payloadType` determines what type of input to show:
- float/int/phase/unit → number input
- bool → boolean toggle/checkbox
- vec2 → x/y inputs (future)
- color → color picker (future)

## UI Patterns

### MUI Components Available

```typescript
import { TextField, Slider, Switch, Select, MenuItem } from '@mui/material';
```

### Theme Colors

```typescript
import { colors } from '../theme';
// colors.primary, colors.bgPanel, colors.textPrimary, etc.
```

### Styling Pattern

Current BlockInspector uses inline styles. Maintain this pattern:
```tsx
<div style={{ padding: '16px', color: colors.textSecondary }}>
```

## Gotchas

1. **BlockId is a branded string**: Use `as BlockId` when converting from node.id
2. **Params are readonly**: Create new object when updating: `{ ...params, [key]: value }`
3. **Observer required**: Keep `observer()` wrapper on BlockInspector
4. **Number parsing**: Use `parseFloat()` for numeric inputs, validate NaN

## Testing Approach

1. Load app with existing patch
2. Click block in editor
3. Verify inspector updates
4. Edit a param value
5. Verify change persists (check block.params in console)
6. Click away, click back → value still correct
