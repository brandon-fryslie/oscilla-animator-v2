# Implementation Context: patch-format Sprint

Updated: 2026-01-18T19:20:00

## Research Summary

No blocking unknowns. All research questions resolved:

1. **Patch Port Model**: Ports come from registry only. Adding `inputDefaults` to Block is the right approach.
2. **Serialization**: None exists. No migration needed.
3. **Pass1 Changes**: Simple check for instance override before registry lookup.
4. **UI Changes**: Add defaultSource to OscillaNodeData, render indicator in OscillaNode.

## Key Files

### Data Model

```
src/graph/Patch.ts        - Block interface (add inputDefaults)
src/types/index.ts        - DefaultSource type (already exists)
```

### Pass1 Normalization

```
src/graph/passes/pass1-default-sources.ts  - Add instance override check
```

### Store

```
src/stores/PatchStore.ts  - Add updateBlockInputDefault action
```

### UI

```
src/ui/reactFlowEditor/nodes.ts       - Add defaultSource to port data
src/ui/reactFlowEditor/OscillaNode.tsx - Render indicator
```

## Existing Types

### DefaultSource (from src/types/index.ts)

```typescript
type DefaultSource =
  | { readonly kind: 'rail'; readonly railId: string }
  | { readonly kind: 'constant'; readonly value: unknown }
  | { readonly kind: 'none' };
```

### Block (from src/graph/Patch.ts) - CURRENT

```typescript
interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  readonly label?: string;
  readonly displayName: string | null;
  readonly domainId: string | null;
  readonly role: BlockRole;
}
```

### Block (PROPOSED)

```typescript
interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  readonly label?: string;
  readonly displayName: string | null;
  readonly domainId: string | null;
  readonly role: BlockRole;
  readonly inputDefaults?: Readonly<Record<string, DefaultSource>>;  // NEW
}
```

## Implementation Steps

### Step 1: Update Block Type

In `src/graph/Patch.ts`:
1. Import DefaultSource from types
2. Add `inputDefaults` field to Block interface
3. Update PatchBuilder.addBlock to accept inputDefaults option

### Step 2: Update Pass1

In `src/graph/passes/pass1-default-sources.ts`:
1. Add helper function to get effective default
2. Call helper instead of direct registry access

```typescript
function getEffectiveDefaultSource(
  block: Block,
  input: InputDef
): DefaultSource | undefined {
  // Instance override takes precedence
  const override = block.inputDefaults?.[input.id];
  if (override) return override;

  // Fall back to registry
  return (input as InputDef & { defaultSource?: DefaultSource }).defaultSource;
}
```

### Step 3: Update PatchStore

In `src/stores/PatchStore.ts`:
1. Add action to update input default
2. Register in makeObservable

### Step 4: Update UI

In `src/ui/reactFlowEditor/nodes.ts`:
1. Update OscillaNodeData to include defaultSource per input
2. Update createNodeFromBlock to merge instance and registry defaults

In `src/ui/reactFlowEditor/OscillaNode.tsx`:
1. Add indicator component/element
2. Add tooltip formatting

## CSS for Indicators

```css
.default-indicator {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.default-indicator--constant {
  background: #4CAF50;  /* Green for constants */
}

.default-indicator--rail {
  background: #2196F3;  /* Blue for rails */
}
```

## Test Cases

1. Block with no defaults → no indicators
2. Block with registry default → indicator shows
3. Block with instance override → indicator shows override
4. Clear instance override → reverts to registry
5. Compile with instance override → correct value used
