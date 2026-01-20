# Implementation Context: param-hints Sprint

**Generated:** 2026-01-20

## Key Files

### Primary Changes
1. `src/blocks/registry.ts` - Add `paramHints` to `BlockDef` interface (~line 125)
2. `src/ui/components/BlockInspector.tsx` - Update `ParamField` component (~line 1632)
3. `src/blocks/signal-blocks.ts` - Update Const block registration (~line 26)

### Reference Files (Read Only)
- `src/types/index.ts` - `UIControlHint` type definition (lines 241-249)

## Code Patterns

### UIControlHint Type
```typescript
export type UIControlHint =
  | { kind: 'slider'; min: number; max: number; step: number }
  | { kind: 'int'; min?: number; max?: number; step?: number }
  | { kind: 'float'; min?: number; max?: number; step?: number }
  | { kind: 'select'; options: { value: string; label: string }[] }
  | { kind: 'color' }
  | { kind: 'boolean' }
  | { kind: 'text' }
  | { kind: 'xy' };
```

### Existing InputDef with uiHint
```typescript
// Example from Square block in primitive-blocks.ts
inputs: [
  {
    id: 'size',
    label: 'Size',
    type: signalType('float'),
    defaultValue: 0.02,
    defaultSource: defaultSourceConst(0.02),
    uiHint: {kind: 'slider', min: 0.01, max: 0.5, step: 0.01},
  },
],
```

### Current ParamField Logic
```typescript
// Look for matching input to get uiHint
const inputDef = typeInfo.inputs.find(i => i.id === paramKey);
const uiHint = inputDef?.uiHint;

if (uiHint) {
  return <HintedControl hint={uiHint} ... />;
}
// else fall back to type inference
```

## Import Requirements

### registry.ts
Already imports `UIControlHint` from '../types' (line 9)

### BlockInspector.tsx
Already imports `UIControlHint` from '../../types' (line 16)

## Testing Notes

- No automated tests for UI components exist
- Manual testing via dev server is the verification method
- Ensure `npm run dev` works and navigate to inspector with Const block selected
