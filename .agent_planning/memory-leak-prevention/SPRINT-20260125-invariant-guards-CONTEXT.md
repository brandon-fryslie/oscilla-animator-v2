# Implementation Context: invariant-guards

**Sprint:** Debug-Mode Lifetime Enforcement
**Generated:** 2026-01-25

## Buffer Poisoning Strategy

### Why Poison?

Stale buffer access is **silent corruption**—code reads garbage but doesn't crash. By filling released buffers with NaN/sentinel values, we make corruption **loud and visible**:

- Float buffers filled with `NaN` → positions become `NaN` → nothing renders
- Color buffers filled with `0xFF` → bright magenta pixels → visually obvious
- Index buffers filled with `0xDEADBEEF` → invalid topology lookups → crash

### Implementation

```typescript
// In BufferPool.releaseAll()

if (import.meta.env.DEV) {
  const POISON_F32 = NaN;
  const POISON_U8 = 0xFF;
  const POISON_U32 = 0xDEADBEEF;

  for (const buffers of this.inUse.values()) {
    for (const buf of buffers) {
      if (buf instanceof Float32Array) {
        buf.fill(POISON_F32);
      } else if (buf instanceof Float64Array) {
        buf.fill(POISON_F32);
      } else if (buf instanceof Uint8ClampedArray) {
        buf.fill(POISON_U8);
      } else if (buf instanceof Uint8Array) {
        buf.fill(POISON_U8);
      } else if (buf instanceof Uint32Array) {
        buf.fill(POISON_U32);
      }
    }
  }
}
```

### Performance Impact

Buffer fill is O(N) but very fast (memset-equivalent). For 100KB buffers:
- Fill time: ~10µs
- 100 buffers × 10µs = 1ms overhead per frame
- Acceptable in dev mode; disabled in production

## View Tracking Design (P1)

### Challenge

When `depthSortAndCompact` returns `pooledScreenPos.subarray(0, N)`, we want to know if that view is retained beyond the frame.

### Option A: WeakSet Tracking

```typescript
const activeViews = new WeakSet<ArrayBufferView>();

function trackView(view: ArrayBufferView): void {
  activeViews.add(view);
}

function releaseAll(): void {
  // After frame, any views still in WeakSet may be retained
  // But... WeakSet doesn't let us iterate!
}
```

**Problem:** Can't iterate WeakSet to check for retained views.

### Option B: Proxy Wrapper

```typescript
function createTrackedView(buffer: Float32Array, start: number, end: number): Float32Array {
  const view = buffer.subarray(start, end);
  return new Proxy(view, {
    get(target, prop) {
      if (frameId !== currentFrameId) {
        console.warn('Stale view access detected!');
      }
      return Reflect.get(target, prop);
    }
  });
}
```

**Problem:** Proxy on TypedArray is slow and may not preserve all semantics.

### Option C: Unique Frame-Stamped Buffers

```typescript
// Each frame, allocate fresh output buffers (not pooled)
// At frame end, they become garbage
// GC will eventually collect them
// Use finalizer to detect if they survive too long

const registry = new FinalizationRegistry((heldValue: string) => {
  console.warn(`Buffer from frame ${heldValue} was garbage collected late`);
});

function allocOutputBuffer(count: number, frameId: number): Float32Array {
  const buf = new Float32Array(count);
  registry.register(buf, `frame-${frameId}`);
  return buf;
}
```

**Problem:** FinalizationRegistry is async and may not catch immediate retention.

### Recommendation

For now, **skip P1** and rely on:
1. Buffer poisoning (P0) to make stale access obvious
2. Memory instrumentation (Sprint 2) to detect leaks via metrics

If specific view retention bugs recur, revisit P1 with Proxy approach.

## Pool Exhaustion Thresholds

| Threshold | Purpose | Action |
|-----------|---------|--------|
| Pool buffers > 1000 | Detect infinite loops | console.warn |
| Single alloc > 10MB | Detect domain explosion | console.warn |
| Total pooled > 100MB | Detect accumulated bloat | console.warn |

These are warnings, not crashes—they alert developers to investigate.

```typescript
alloc(format: BufferFormat, count: number): ArrayBufferView {
  if (import.meta.env.DEV) {
    const totalBuffers = this.countAllBuffers();
    if (totalBuffers > 1000) {
      console.warn(`BufferPool: Excessive buffer count (${totalBuffers}). Possible leak.`);
    }

    const allocBytes = estimateBytes(format, count);
    if (allocBytes > 10 * 1024 * 1024) {
      console.warn(`BufferPool: Large allocation (${(allocBytes / 1024 / 1024).toFixed(1)}MB). Check domain size.`);
    }
  }
  // ... rest of alloc ...
}
```
