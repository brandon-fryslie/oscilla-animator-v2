# Implementation Context: visual-indicators
Generated: 2026-02-01
Source: EVALUATION-2026-02-01-195800.md

## 1. Edge Visualization for Lensed Connections

### File: `src/ui/reactFlowEditor/nodes.ts`

**Function `createEdgeFromPatchEdge()`** (lines 328-372):

Current signature:
```typescript
export function createEdgeFromPatchEdge(
  edge: Edge,
  blocks?: ReadonlyMap<BlockId, Block>,
  nonContributingEdges?: Set<string>
): ReactFlowEdge
```

The function already receives `blocks` which contains the full `Block` objects including `inputPorts` with `lenses`. No signature change is needed.

**Insertion point**: After the existing adapter detection block (lines 351-369), add lens detection:

```typescript
// After the existing adapter block (line 369), add:

// Check for user-attached lenses on the target port
if (blocks && !isNonContributing) {
  const targetBlock = blocks.get(edge.to.blockId as BlockId);
  if (targetBlock) {
    const targetPort = targetBlock.inputPorts.get(edge.to.slotId);
    if (targetPort?.lenses && targetPort.lenses.length > 0) {
      const lensLabels = targetPort.lenses
        .map(l => getLensLabel(l.lensType))
        .join(', ');
      rfEdge.label = lensLabels;
      rfEdge.labelStyle = { fontSize: 10, fill: '#d97706' }; // Darker amber for text
      rfEdge.style = { ...(rfEdge.style || {}), stroke: '#f59e0b' };
    }
  }
}
```

**Import to add** (top of file):
```typescript
import { getLensLabel } from './lensUtils';
```

Note: `getLensLabel` is already defined in `src/ui/reactFlowEditor/lensUtils.ts` (line 53).

### Call site: `src/ui/reactFlowEditor/sync.ts`

The sync file calls `createEdgeFromPatchEdge` -- search for usages. Since the signature is unchanged (blocks already passed), no call site changes are needed.

---

## 2. Test Coverage for lensUtils.ts

### New file: `src/ui/reactFlowEditor/__tests__/lensUtils.test.ts`

**Imports needed:**
```typescript
import { describe, it, expect } from 'vitest';
import { getAvailableLensTypes, getLensLabel, canApplyLens, findCompatibleLenses } from '../lensUtils';
```

**Block registry setup**: The adapter blocks must be registered before tests run. Check how `src/blocks/__tests__/adapter-spec.test.ts` handles this:

```typescript
// adapter-spec.test.ts uses blocks that are auto-registered via import side effects
// Ensure adapter blocks are imported:
import '../../blocks/adapter-blocks';  // or wherever adapter blocks are registered
```

Find the adapter block registration file:
- `src/blocks/adapter-blocks.ts` or similar -- check `src/blocks/` for files that call `defineBlock()` with `adapterSpec`

**Test structure:**
```typescript
describe('lensUtils', () => {
  describe('getAvailableLensTypes', () => {
    it('returns adapter blocks from registry', () => {
      const types = getAvailableLensTypes();
      expect(types.length).toBeGreaterThan(0);
      for (const t of types) {
        expect(t.blockType).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.inputType).toBeTruthy();
        expect(t.outputType).toBeTruthy();
      }
    });
    it('returns types sorted by label', () => { ... });
  });

  describe('getLensLabel', () => {
    it('returns registry label for known type', () => { ... });
    it('formats unknown type by removing Adapter_ prefix', () => {
      expect(getLensLabel('Adapter_FooBar')).toBe('Foo Bar');
    });
  });

  describe('canApplyLens', () => {
    it('returns true when source matches lens input and lens output matches target', () => { ... });
    it('returns false when source payload differs from lens input', () => { ... });
  });

  describe('findCompatibleLenses', () => {
    it('returns empty array when no lenses match', () => { ... });
    it('returns matching lenses for compatible type pair', () => { ... });
  });
});
```

**Type construction helpers**: Use `canonicalType()` from `src/core/canonical-types` to build test types:
```typescript
import { FLOAT, INT, canonicalType } from '../../../core/canonical-types';
// canonicalType(FLOAT) creates a default CanonicalType with float payload
```

---

## 3. PortInfoPopover Lens Params Display

### File: `src/ui/reactFlowEditor/PortInfoPopover.tsx`

**Lines 302-310** current lens rendering:
```tsx
{port.lenses.map((lens) => (
  <Group key={lens.id} gap="xs">
    <Badge size="xs" color="orange" variant="light">
      {getLensLabel(lens.lensType)}
    </Badge>
    <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
      {lens.sourceAddress.split('.').slice(-2).join('.')}
    </Text>
  </Group>
))}
```

**Add params display** after the sourceAddress Text, inside the `<Group>`:
```tsx
{port.lenses.map((lens) => (
  <Group key={lens.id} gap="xs" wrap="wrap">
    <Badge size="xs" color="orange" variant="light">
      {getLensLabel(lens.lensType)}
    </Badge>
    <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
      {lens.sourceAddress.split('.').slice(-2).join('.')}
    </Text>
    {lens.params && Object.keys(lens.params).length > 0 && (
      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
        ({Object.entries(lens.params).map(([k, v]) => `${k}: ${String(v)}`).join(', ')})
      </Text>
    )}
  </Group>
))}
```

**Import**: `getLensLabel` is already imported in this file (used on line 305).

---

## 4. Lens Indicator Tooltip Enhancement

### File: `src/ui/reactFlowEditor/OscillaNode.tsx`

**Line 254** current tooltip:
```tsx
title={`${input.lensCount} lens${input.lensCount > 1 ? 'es' : ''} attached`}
```

**Replace with:**
```tsx
title={
  input.lenses && input.lenses.length > 0
    ? input.lenses.map(l => getLensLabel(l.lensType)).join(', ')
    : `${input.lensCount} lens${input.lensCount! > 1 ? 'es' : ''}`
}
```

**Import to add** (top of file):
```typescript
import { getLensLabel } from './lensUtils';
```

Check existing imports in OscillaNode.tsx to avoid duplicates. The file currently imports from `./typeValidation` and `./nodes` -- `getLensLabel` is from `./lensUtils`.

**`PortData` type** (from `src/ui/reactFlowEditor/nodes.ts:36-56`):
- `lensCount?: number` (line 53)
- `lenses?: readonly LensAttachment[]` (line 55)

Both fields are already populated by `createPortData()` at lines 131-132. The `lenses` array contains full `LensAttachment` objects with `lensType` field needed for `getLensLabel()`.
