# Implementation Context: data-model-ui

**Sprint:** Combine Mode Data Model and Port Inspector UI
**Generated:** 2026-01-25

## Key Files

| File | Purpose |
|------|---------|
| `src/graph/Patch.ts` | Add combineMode to InputPort interface |
| `src/ui/components/BlockInspector.tsx` | Add dropdown to PortInspectorStandalone |
| `src/compiler/passes-v2/combine-utils.ts` | Use validateCombineMode for filtering |
| `src/types/index.ts` | CombineMode type already defined |

## Data Model Change

**File:** `src/graph/Patch.ts`

```typescript
// Current (line 60-65):
export interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
}

// After:
export interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
  readonly combineMode?: CombineMode;
}
```

Add import at top:
```typescript
import type { BlockId, PortId, BlockRole, DefaultSource, EdgeRole, CombineMode } from '../types';
```

## UI Implementation

**Location:** `src/ui/components/BlockInspector.tsx`, inside `PortInspectorStandalone`

Add after the Signal Type section (~line 350), before Default Source:

```tsx
{/* Combine Mode - only for input ports */}
{isInput && (
  <CombineModeSelector
    portType={portDef.type!}
    currentMode={instancePort?.combineMode ?? 'last'}
    onChange={(mode) => {
      patchStore.updateInputPort(block.id, portRef.portId, { combineMode: mode });
    }}
  />
)}
```

Create new component:

```tsx
interface CombineModeSelectorProps {
  portType: CanonicalType;
  currentMode: CombineMode;
  onChange: (mode: CombineMode) => void;
}

function CombineModeSelector({ portType, currentMode, onChange }: CombineModeSelectorProps) {
  // Get valid modes for this payload type
  const validModes = getValidCombineModes(portType.payload);

  return (
    <div style={{ marginBottom: '16px' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
        Combine Mode
      </h4>
      <MuiSelectInput
        value={currentMode}
        onChange={(value) => onChange(value as CombineMode)}
        options={validModes.map(mode => ({ value: mode, label: formatCombineMode(mode) }))}
        size="sm"
      />
    </div>
  );
}

function getValidCombineModes(payload: string): CombineMode[] {
  // All modes
  const allModes: CombineMode[] = ['last', 'first', 'sum', 'average', 'max', 'min', 'mul', 'layer', 'or', 'and'];

  // Filter based on payload type
  return allModes.filter(mode => {
    const result = validateCombineMode(mode, 'signal', payload);
    return result.valid;
  });
}

function formatCombineMode(mode: CombineMode): string {
  const labels: Record<CombineMode, string> = {
    last: 'Last (default)',
    first: 'First',
    sum: 'Sum',
    average: 'Average',
    max: 'Maximum',
    min: 'Minimum',
    mul: 'Multiply',
    layer: 'Layer',
    or: 'OR (boolean)',
    and: 'AND (boolean)',
  };
  return labels[mode] ?? mode;
}
```

## Imports Needed

Add to BlockInspector.tsx:
```typescript
import type { CombineMode } from '../../types';
import { validateCombineMode } from '../../compiler/passes-v2/combine-utils';
```

## Expected Valid Modes by Type

| Payload | Valid Modes |
|---------|-------------|
| float, int, vec2, vec3 | last, first, sum, average, max, min, mul |
| color | last, first, layer |
| bool | last, first, or, and |
| shape | last, first |
| other | last, first |

## PatchStore Integration

The `updateInputPort` method already exists and handles `defaultSource`. Extend it to handle `combineMode`:

```typescript
// In PatchStore, updateInputPort should handle:
updateInputPort(blockId: BlockId, portId: string, updates: Partial<InputPort>): void {
  // ... existing logic for defaultSource ...
  // combineMode follows same pattern
}
```

If it doesn't handle arbitrary updates, may need modification.
