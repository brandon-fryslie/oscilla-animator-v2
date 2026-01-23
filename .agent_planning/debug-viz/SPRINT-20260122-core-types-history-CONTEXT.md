# Implementation Context: core-types-history

## Key Files to Modify

### New Files
- `src/ui/debug-viz/types.ts` — Core types + getSampleEncoding
- `src/ui/debug-viz/HistoryService.ts` — Ring buffer service
- `src/ui/debug-viz/__tests__/types.test.ts` — Type tests
- `src/ui/debug-viz/__tests__/HistoryService.test.ts` — History tests

### Modified Files
- `src/services/DebugService.ts` — Add onSlotWrite hook, onMappingChanged event

## Type System Reference

### PayloadType (src/core/canonical-types.ts:121-126)
```typescript
type PayloadType = 'float' | 'int' | 'color' | 'shape';
// Note: vec2, vec3, bool may not be in current union - check at implementation time
```

### Unit (src/core/canonical-types.ts:32-89)
Discriminated union with `kind` field:
- `'none'` | `'scalar'` | `'norm01'` | `'phase01'` | `'radians'` | `'degrees'` | `'ms'` | `'seconds'` | `'count'` | `'ndc2'` | `'ndc3'` | `'world2'` | `'world3'` | `'rgba01'`

### SignalType (used in EdgeMetadata)
Has `payload`, `unit`, `extent` fields. Use `resolveExtent(type.extent)` to get resolved cardinality/temporality.

### EdgeMetadata (src/services/mapDebugEdges.ts)
```typescript
interface EdgeMetadata {
  slotId: ValueSlot;
  type: SignalType;
  cardinality: 'signal' | 'field';
}
```

## DebugService Current API (relevant methods)

```typescript
// Metadata resolution
getEdgeMetadata(edgeId: string): EdgeMetadata | undefined
getPortValue(blockId: string, portName: string): EdgeValueResult | undefined

// Value updates (hot path — HistoryService hooks here)
updateSlotValue(slotId: ValueSlot, value: number): void
updateFieldValue(slotId: ValueSlot, buffer: Float32Array): void

// Mapping
setEdgeToSlotMap(map: Map<string, EdgeMetadata>): void
setPortToSlotMap(map: Map<string, EdgeMetadata>): void
clear(): void
```

## Circular Dependency Avoidance

HistoryService needs to resolve metadata (to get type/stride) when `track()` is called.
DebugService needs to call HistoryService.onSlotWrite() in updateSlotValue().

Solution: HistoryService takes a resolver function at construction:
```typescript
type MetadataResolver = (key: DebugTargetKey) => EdgeMetadata | undefined;

class HistoryServiceImpl {
  constructor(private resolveMetadata: MetadataResolver) {}
}
```

DebugService creates HistoryService with a resolver that delegates back:
```typescript
const historyService = new HistoryServiceImpl(
  (key) => {
    if (key.kind === 'edge') return debugService.getEdgeMetadata(key.edgeId);
    // port resolution...
  }
);
```

## Ring Buffer Consumer Index (safe JS modulo)

```typescript
// To read the k-th newest sample (k=0 is newest):
const totalWritten = entry.writeIndex;
const idx = totalWritten - 1 - k;
const slot = ((idx % HISTORY_CAPACITY) + HISTORY_CAPACITY) % HISTORY_CAPACITY;
const value = entry.buffer[slot]; // stride=1 in v1
```

## Test Patterns

Use vitest. The existing DebugService tests use the singleton pattern:
```typescript
import { debugService } from './DebugService';

beforeEach(() => { debugService.clear(); });
```

HistoryService tests should use a fresh instance with mock resolver:
```typescript
const mockResolver = (key: DebugTargetKey) => ({
  slotId: 10 as ValueSlot,
  type: signalType('float'),
  cardinality: 'signal' as const,
});
const service = new HistoryServiceImpl(mockResolver);
```
