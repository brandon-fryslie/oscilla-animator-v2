# Implementation Context: ui-indicators Sprint

## Key Files

### Primary Implementation

- `src/ui/reactFlowEditor/OscillaNode.tsx` - Node component with port rendering
- `src/blocks/registry.ts` - Block definitions with `InputDef.defaultSource`

### Supporting Files

- `src/types/index.ts` - `DefaultSource` type definition
- `src/ui/reactFlowEditor/sync.ts` - Patch to ReactFlow sync
- `src/ui/reactFlowEditor/ReactFlowEditor.css` - Styles

## DefaultSource Type

```typescript
type DefaultSource =
  | { kind: 'rail'; railId: string }
  | { kind: 'constant'; value: unknown }
  | { kind: 'none' };
```

## Getting Default Source for a Port

```typescript
import { getBlockDefinition, type InputDef } from '../../blocks/registry';

function getDefaultSourceForInput(blockType: string, inputId: string): DefaultSource | undefined {
  const def = getBlockDefinition(blockType);
  if (!def) return undefined;

  const input = def.inputs.find(i => i.id === inputId);
  return (input as InputDef & { defaultSource?: DefaultSource })?.defaultSource;
}
```

## Existing Port Rendering Pattern

In OscillaNode, ports are likely rendered based on block definition. Add indicator logic adjacent to port rendering.

## CSS Indicator Approach

```css
/* Example indicator styles */
.port-default-indicator {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  top: -3px;
  right: -3px;
}

.port-default-indicator--constant {
  background: var(--color-constant, #4CAF50);
}

.port-default-indicator--rail {
  background: var(--color-rail, #2196F3);
}
```

## Blocks with Default Sources (Examples)

- `GridLayout` - rows, cols have constant defaults
- `WaveOscillator` - frequency has constant default
- Most blocks have defaults for optional inputs

## Notes

- Current implementation: pass1 materializes blocks but only during normalization
- Editor likely shows raw patch, not normalized patch
- Verification: check if `_ds_*` blocks appear in editor currently
