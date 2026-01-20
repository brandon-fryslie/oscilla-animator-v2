# Stable Memory Model Design

**Goal**: Perfectly stable memory usage over time with 15k element capacity

## Current State (After Initial Fix)

The system is already well-designed with zero per-frame typed array allocations. After adding `pool.releaseAll()`, the major leak is fixed. However, some sources of variability remain:

### Remaining Variability Sources

| Source | Location | Impact | Fix Strategy |
|--------|----------|--------|--------------|
| Render pass objects | ScheduleExecutor.ts:238 | 1-10 objects/frame | Pool render descriptors |
| Field cache growth | Materializer.ts | Up to 200 entries | Pre-allocate max |
| Continuity snapshots | ContinuityApply.ts:343-344 | On domain change | Pre-allocate snapshot buffers |
| Domain mapping temps | ContinuityMapping.ts | On domain change | Pool mapping arrays |
| Buffer pool key strings | BufferPool.ts:75 | On new buffer sizes | Intern keys |
| `values.objects` Map | RuntimeState.ts | Grows with slots | Pre-size Map |

## Fixed-Capacity Memory Model

### Design Principles

1. **Pre-allocate everything at startup** based on MAX_ELEMENTS (15,000)
2. **Zero allocations per frame** in steady state
3. **Bounded allocations on change** - reuse pre-allocated pools
4. **Intern all keys** - no string allocation in hot paths

### Memory Budget (15k elements)

```
Buffer Type          Count    Size Each       Total
─────────────────────────────────────────────────────
f32 buffers          8        15000 × 4B      480 KB
vec2f32 buffers      4        15000 × 8B      480 KB
rgba8 buffers        2        15000 × 4B      120 KB
Continuity gauge     4        15000 × 4B      240 KB
Continuity slew      4        15000 × 4B      240 KB
Continuity snapshot  2        15000 × 4B      120 KB
Domain ID arrays     2        15000 × 4B      120 KB
Mapping arrays       2        15000 × 4B      120 KB
Signal values        1        1000 × 8B         8 KB
Signal stamps        1        1000 × 4B         4 KB
─────────────────────────────────────────────────────
TOTAL                                        ~1.9 MB
```

Plus overhead:
- Maps/Sets structure: ~50 KB
- Render pass pool: ~10 KB
- Misc objects: ~40 KB

**Total fixed memory budget: ~2 MB**

### Architecture Changes

#### 1. FixedBufferPool (replaces BufferPool)

```typescript
interface FixedBufferPool {
  // Pre-allocated buffer slots by format
  readonly f32Buffers: Float32Array[];      // 8 × 15000
  readonly vec2Buffers: Float32Array[];     // 4 × 15000
  readonly rgba8Buffers: Uint8ClampedArray[]; // 2 × 15000

  // Allocation tracking (no Map, use arrays)
  readonly f32InUse: boolean[];
  readonly vec2InUse: boolean[];
  readonly rgba8InUse: boolean[];

  // Methods
  alloc(format: BufferFormat, count: number): ArrayBufferView;
  release(buffer: ArrayBufferView): void;
  releaseAll(): void;
}
```

**Key change**: No dynamic allocation. If a buffer is requested larger than MAX_ELEMENTS, throw error (hard cap).

#### 2. Pre-allocated Continuity Buffers

```typescript
interface ContinuityBufferPool {
  // Pre-allocated gauge/slew pairs (4 targets typical)
  readonly gaugeBuffers: Float32Array[];   // 4 × 15000
  readonly slewBuffers: Float32Array[];    // 4 × 15000

  // Snapshot buffers for domain changes (2 sufficient)
  readonly snapshotBuffers: Float32Array[]; // 2 × 15000

  // Allocation tracking
  readonly gaugeInUse: boolean[];
  readonly slewInUse: boolean[];
  readonly snapshotInUse: boolean[];
}
```

#### 3. Pre-allocated Render Pass Descriptors

```typescript
interface RenderPassPool {
  readonly passes: RenderPassIR[];  // Pre-allocate 10
  activeCount: number;

  acquire(): RenderPassIR;
  releaseAll(): void;
}
```

Mutate in place rather than creating new objects.

#### 4. Interned Cache Keys

```typescript
// Pre-compute all possible cache keys at startup
const fieldCacheKeys = new Map<number, Map<string, string>>();

function getFieldCacheKey(fieldId: FieldExprId, instanceId: string): string {
  // Returns interned string, no allocation
  return fieldCacheKeys.get(fieldId)?.get(instanceId) ?? internKey(fieldId, instanceId);
}
```

### Implementation Phases

#### Phase 1: Enforce Hard Cap (Quick Win)

Add runtime check to prevent allocations beyond MAX_ELEMENTS:

```typescript
const MAX_ELEMENTS = 15000;

// In BufferPool.alloc():
if (count > MAX_ELEMENTS) {
  throw new Error(`Element count ${count} exceeds MAX_ELEMENTS ${MAX_ELEMENTS}`);
}
```

This prevents unbounded growth immediately.

#### Phase 2: Pre-allocate BufferPool

Replace dynamic Map-based pooling with fixed-size array pools:

1. At startup, allocate all buffer slots
2. Use index-based tracking instead of Map keys
3. Remove all `new Float32Array()` from hot paths

#### Phase 3: Pre-allocate Continuity Buffers

1. Create ContinuityBufferPool at startup
2. Modify `getOrCreateTargetState()` to use pool
3. Pre-allocate snapshot buffers for domain changes

#### Phase 4: Pool Render Descriptors

1. Create RenderPassPool with 10 pre-allocated objects
2. Modify `executeFrame()` to reuse descriptors
3. Clear/reset descriptor fields instead of creating new

#### Phase 5: Intern All Keys

1. Pre-compute field cache keys at compile time
2. Pre-compute buffer pool keys (finite set: ~10 format:count combinations)
3. Pre-compute stable target IDs at target creation

### Verification Approach

After implementation:

1. **Heap snapshot at startup**: Record baseline
2. **Run 10 minutes**: Should be identical to baseline
3. **Domain changes**: May show temporary +1-2 buffers, then return to baseline
4. **Stress test**: 15k elements for 1 hour, verify no growth

### Trade-offs

| Trade-off | Impact | Mitigation |
|-----------|--------|------------|
| Hard 15k element cap | Can't exceed without code change | Make MAX_ELEMENTS configurable |
| More startup memory | ~2MB even with 100 elements | Acceptable for animation tool |
| Fixed render pass count | Max 10 passes | Rarely need more than 5 |
| Code complexity | More bookkeeping | Good comments, clear ownership |

### Alternative: Lazy Pre-allocation

Instead of allocating all at startup, we could:
1. Track high-water mark
2. Never free buffers once allocated
3. Reuse from high-water pool

This uses less memory initially but still guarantees stability after warm-up period.

## Recommendation

**Start with Phase 1 (hard cap)** - this is a 5-line change that prevents unbounded growth.

Then implement Phase 2 (pre-allocated BufferPool) which gives the biggest stability improvement.

Phases 3-5 are polish - they eliminate the last few allocations but have diminishing returns.

## Quick Win Implementation

```typescript
// src/runtime/BufferPool.ts - Add at top of file
const MAX_ELEMENTS = 15000;

// In alloc() method, add check:
alloc(format: BufferFormat, count: number): ArrayBufferView {
  if (count > MAX_ELEMENTS) {
    throw new Error(
      `Element count ${count} exceeds MAX_ELEMENTS ${MAX_ELEMENTS}. ` +
      `Reduce instance count or increase MAX_ELEMENTS.`
    );
  }
  // ... rest of method
}
```

This immediately bounds memory and makes the system predictable.
