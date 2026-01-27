# Implementation Context: display-names Sprint

**Generated**: 2026-01-27T18:00:00Z

## Key Files

### Primary Changes

| File | Purpose |
|------|---------|
| `src/stores/PatchStore.ts` | Add auto-generation logic, validation in updateBlockDisplayName |
| `src/ui/reactFlowEditor/OscillaNode.tsx` | Add inline editing UI |
| `src/graph/Patch.ts` | Change displayName type from `string \| null` to `string` |

### Supporting Files (Reference)

| File | Purpose |
|------|---------|
| `src/core/canonical-name.ts` | Use utilities for normalization and validation |
| `src/ui/components/BlockInspector.tsx` | Pattern reference for DisplayNameEditor |
| `src/blocks/registry.ts` | BlockDef.label for auto-generation base |

## Code Patterns

### Auto-generation Pattern

```typescript
// In PatchStore.ts
function generateDefaultDisplayName(
  blockType: string,
  existingBlocks: ReadonlyMap<BlockId, Block>,
  blockDef: BlockDef
): string {
  // Count blocks of same type
  let count = 1;
  for (const block of existingBlocks.values()) {
    if (block.type === blockType) count++;
  }

  // Generate candidate
  let candidate = `${blockDef.label} ${count}`;

  // Check collision against ALL blocks
  const existingNames = Array.from(existingBlocks.values())
    .map(b => b.displayName)
    .filter((n): n is string => n !== null);

  while (detectCanonicalNameCollisions([...existingNames, candidate]).collisions.length > 0) {
    count++;
    candidate = `${blockDef.label} ${count}`;
  }

  return candidate;
}
```

### Inline Edit Pattern (from BlockInspector)

```typescript
const [isEditing, setIsEditing] = useState(false);
const [editValue, setEditValue] = useState('');

const handleDoubleClick = () => {
  setEditValue(currentDisplayName);
  setIsEditing(true);
};

const handleBlur = () => {
  setIsEditing(false);
  const newName = editValue.trim();
  if (newName && newName !== currentDisplayName) {
    // Validate collision
    // Call patchStore.updateBlockDisplayName()
  }
};
```

## Validation Rules

1. **Canonical Collision**: Two displayNames that normalize to the same canonical form
   - "My Block" and "my block" → both normalize to "my_block" → COLLISION
   - "Circle 1" and "Circle  1" → both normalize to "circle_1" → COLLISION

2. **Empty Not Allowed**: displayName must be non-empty string

3. **Special Characters Allowed**: User can use any characters in displayName
   - Canonical form strips special chars for addressing
   - UI shows original displayName

## Migration Path for null displayName

When loading patches with `displayName: null`:

```typescript
// In loadPatch()
for (const [blockId, block] of patch.blocks) {
  if (block.displayName === null) {
    const blockDef = requireBlockDef(block.type);
    const generatedName = generateDefaultDisplayName(block.type, result.blocks, blockDef);
    result.blocks.set(blockId, { ...block, displayName: generatedName });
  }
}
```

## Test Cases

### Unit Tests for generateDefaultDisplayName

```typescript
describe('generateDefaultDisplayName', () => {
  it('generates "Type 1" for first block of type', () => {
    const result = generateDefaultDisplayName('Oscillator', new Map(), oscDef);
    expect(result).toBe('Oscillator 1');
  });

  it('generates "Type 2" when "Type 1" exists', () => {
    const existing = new Map([['b0', { type: 'Oscillator', displayName: 'Oscillator 1' }]]);
    const result = generateDefaultDisplayName('Oscillator', existing, oscDef);
    expect(result).toBe('Oscillator 2');
  });

  it('skips collisions across different types', () => {
    const existing = new Map([
      ['b0', { type: 'Other', displayName: 'Oscillator 1' }]  // collision!
    ]);
    const result = generateDefaultDisplayName('Oscillator', existing, oscDef);
    expect(result).toBe('Oscillator 2');  // skipped 1 due to collision
  });
});
```

## UI Considerations

### OscillaNode Edit Mode

- Show input field sized to fit typical names (150-200px)
- Auto-focus on edit mode enter
- Show validation error as red border + tooltip
- Prevent node dragging while editing (stopPropagation)

### Error States

- Collision: Red border, tooltip "Name conflicts with another block"
- Empty: Red border, tooltip "Name cannot be empty"
