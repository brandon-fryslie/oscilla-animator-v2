# Implementation Context: slotmeta-stride

Generated: 2026-01-25T22:10:00
Plan: SPRINT-2026-01-25-221000-slotmeta-stride-PLAN.md

## P0: Fix SlotMeta Offset Calculation

### File to Modify

**Path**: `/Users/bmf/code/oscilla-animator-v2/src/compiler/compile.ts`
**Function**: `convertLinkedIRToProgram()`
**Line Range**: 433-456

### Exact Change

**Current code at line 444**:
```typescript
    const offset = storageOffsets[storage]++;
```

**Replace with**:
```typescript
    const offset = storageOffsets[storage];
    storageOffsets[storage] += stride;
```

### Context: Surrounding Code Pattern

The loop builds slotMeta entries (lines 433-456):
```typescript
  for (let slotId = 0; slotId < builder.getSlotCount?.() || 0; slotId++) {
    const slot = slotId as ValueSlot;
    const type = slotTypes.get(slot) || signalType('float');

    const storage: SlotMetaEntry['storage'] = fieldSlotSet.has(slotId)
      ? 'object'
      : type.payload === 'shape' ? 'shape2d' : 'f64';

    // CHANGE THIS LINE:
    const offset = storageOffsets[storage]++;

    const stride = storage === 'object' ? 1 : payloadStride(type.payload);

    slotMeta.push({
      slot,
      storage,
      offset,
      stride,
      type,
    });
  }
```

Note: The `stride` calculation happens AFTER the offset increment, so we need to compute stride first, then use it for the offset increment.

### Corrected Change (stride must be computed first)

**Full corrected block**:
```typescript
  for (let slotId = 0; slotId < builder.getSlotCount?.() || 0; slotId++) {
    const slot = slotId as ValueSlot;
    const type = slotTypes.get(slot) || signalType('float');

    const storage: SlotMetaEntry['storage'] = fieldSlotSet.has(slotId)
      ? 'object'
      : type.payload === 'shape' ? 'shape2d' : 'f64';

    // Compute stride FIRST (moved up from line 447)
    const stride = storage === 'object' ? 1 : payloadStride(type.payload);

    // Then use stride for offset calculation
    const offset = storageOffsets[storage];
    storageOffsets[storage] += stride;

    slotMeta.push({
      slot,
      storage,
      offset,
      stride,
      type,
    });
  }
```

### Verification Commands

```bash
# Type check
npm run typecheck

# Run tests
npm run test

# Start dev server (if not running)
npm run dev

# Then check browser console at http://localhost:5174
# Should show 0 errors
```

---

## P1: Add Regression Test

### File to Create

**Path**: `/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/slotmeta-stride.test.ts`

### Test Pattern to Follow

Reference: `/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/steel-thread.test.ts`

### Test Implementation

```typescript
/**
 * SlotMeta Stride Regression Test
 *
 * Verifies that slotMeta offset calculation correctly accounts for
 * multi-component payloads (color=4, vec3=3, vec2=2).
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../compile';
import { createEventHub } from '../../events/EventHub';
import type { Patch } from '../../graph';

describe('slotMeta stride calculation', () => {
  it('allocates non-overlapping offsets for multi-stride slots', () => {
    // Minimal patch that triggers time.palette (color, stride=4)
    const patch: Patch = {
      blocks: [],
      edges: [],
    };

    const result = compile(patch, {
      patchId: 'test-stride',
      patchRevision: 1,
      events: createEventHub(),
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const { slotMeta } = result.program;

    // Find slot 0 (time.palette - reserved system slot)
    const slot0 = slotMeta.find(m => m.slot === 0);
    expect(slot0).toBeDefined();
    expect(slot0?.stride).toBe(4); // color has stride=4
    expect(slot0?.offset).toBe(0);

    // Verify no offsets overlap
    // For each slot, its offset range [offset, offset+stride) should not
    // intersect with any other slot's range
    const f64Slots = slotMeta.filter(m => m.storage === 'f64');
    for (let i = 0; i < f64Slots.length; i++) {
      const a = f64Slots[i];
      const aEnd = a.offset + a.stride;
      for (let j = i + 1; j < f64Slots.length; j++) {
        const b = f64Slots[j];
        const bEnd = b.offset + b.stride;
        // Check for overlap: ranges overlap if a.offset < bEnd && b.offset < aEnd
        const overlaps = a.offset < bEnd && b.offset < aEnd;
        expect(overlaps).toBe(false);
      }
    }
  });
});
```

### Import Paths

- `compile` from `../compile`
- `createEventHub` from `../../events/EventHub`
- `Patch` type from `../../graph`

### Run Test Command

```bash
npm run test -- src/compiler/__tests__/slotmeta-stride.test.ts
```
