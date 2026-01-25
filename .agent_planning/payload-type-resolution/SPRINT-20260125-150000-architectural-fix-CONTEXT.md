# Implementation Context: Architectural Fix - Split Pass 0 into 0a/0b

## Architecture Overview

### Current Flow (with interim fix)
```
Patch → Pass 0 (user) → Pass 1 (materialize) → Pass 0 (again) → Pass 2+
         ↑                                       ↑
         Runs twice (interim hack)
```

### Target Flow
```
Patch → Pass 0a (user) → Pass 1 (materialize) → Pass 0b (derived) → Pass 2+
         ↑                                        ↑
         Edge-based inference                     Target-type lookup
```

## Key Difference: Pass 0a vs Pass 0b

| Aspect | Pass 0a (User Blocks) | Pass 0b (Derived Blocks) |
|--------|----------------------|-------------------------|
| **Input** | User-created blocks | Derived blocks from Pass 1 |
| **Resolution Strategy** | Edge inference (forward/backward) | Target input type lookup |
| **Block Selection** | All payload-generic | Only `role.kind === 'derived'` |
| **Edge Availability** | May not have edges | Always has edges (Pass 1 creates them) |

## Pass 0b Implementation Strategy

```typescript
// pass0b-derived-payload-resolution.ts

export function pass0bDerivedPayloadResolution(patch: Patch): Patch {
  const updatedBlocks = new Map(patch.blocks);

  for (const [blockId, block] of patch.blocks) {
    // Only process derived blocks
    if (block.role.kind !== 'derived') continue;

    // Only process payload-generic blocks
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef?.payload) continue;

    // Already resolved?
    if (block.params.payloadType !== undefined) continue;

    // Find the outgoing edge (Pass 1 always creates one)
    const outEdge = patch.edges.find(
      e => e.from.blockId === blockId
    );
    if (!outEdge) continue;

    // Get target block and input definition
    const targetBlock = patch.blocks.get(outEdge.to.blockId as BlockId);
    if (!targetBlock) continue;

    const targetDef = getBlockDefinition(targetBlock.type);
    if (!targetDef) continue;

    const targetInput = targetDef.inputs[outEdge.to.slotId];
    if (!targetInput?.type) continue;

    // Use target input's declared payload type
    const payloadType = targetInput.type.payload;

    const updatedBlock: Block = {
      ...block,
      params: {
        ...block.params,
        payloadType,
      },
    };
    updatedBlocks.set(blockId, updatedBlock);
  }

  return {
    blocks: updatedBlocks,
    edges: patch.edges,
  };
}
```

## Files to Create/Modify

### Create
- `src/graph/passes/pass0b-derived-payload-resolution.ts`

### Modify
- `src/graph/passes/index.ts` - Update orchestration
- `src/graph/passes/index.ts` - Update exports

## Chain Resolution Consideration

If a derived Const connects to a derived Broadcast:
```
[derived Const] → [derived Broadcast] → [user block input]
```

Both need payloadType resolution. Options:
1. **Iterate until stable** (like Pass 1 does for nested defaults)
2. **Process in edge order** (follow edges to find ultimate target)
3. **Restrict scope** (derived blocks only connect to user blocks)

Recommendation: Start with option 3 (restriction) since current DefaultSource implementation only creates blocks that connect directly to user inputs.

## Testing Strategy

### Unit Tests for Pass 0b
```typescript
describe('pass0bDerivedPayloadResolution', () => {
  it('resolves payloadType for derived Const from target input type', () => {
    // Create patch with derived Const → float input
    // Verify payloadType = 'float'
  });

  it('skips non-derived blocks', () => {
    // User-created Const should not be modified
  });

  it('skips already-resolved blocks', () => {
    // Block with payloadType set should not change
  });
});
```

### Integration Test
```typescript
it('full pipeline resolves all payloadTypes', () => {
  // Create patch with HsvToRgb (has defaultSourceConst)
  // Run full normalization
  // Verify derived Const blocks have payloadType
  // Compile should succeed
});
```
