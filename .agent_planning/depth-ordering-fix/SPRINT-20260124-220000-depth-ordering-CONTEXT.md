# Implementation Context: Depth Ordering Fix

Generated: 2026-01-24T22:00:00Z

## Files to Modify

| File | Changes |
|------|---------|
| `src/runtime/RenderAssembler.ts` | Fix comparator, add buffer cache, add monotone check |
| `src/projection/__tests__/level7-depth-culling.test.ts` | Flip all sort-order assertions to far-to-near |
| `design-docs/_new/3d/dod/_completed/level-07-depth-culling.md` | Update "front-to-back" references to "far-to-near" |

## Spec References

- **Topic 18, lines 260-262:** Depth Ordering Contract — far-to-near primary key
- **Topic 18, lines 276-288:** Two-Phase Ordering — fast-path monotone check
- **Topic 18, lines 305-309:** Permutation storage — preallocated, reuse across frames

## Implementation Order

1. **C-24 first** (sort direction) — smallest change, unlocks correct test assertions
2. **C-26 second** (monotone check) — depends on knowing the correct direction from C-24
3. **C-25 last** (buffer preallocations) — most invasive, refactors return semantics

## Detailed Implementation Notes

### C-24: Sort Comparator Fix

```typescript
// BEFORE (wrong):
indices.sort((a, b) => {
  const da = depth[a];
  const db = depth[b];
  if (da !== db) return da - db;  // ascending = near first (WRONG)
  return a - b;
});

// AFTER (correct):
indices.sort((a, b) => {
  const da = depth[a];
  const db = depth[b];
  if (da !== db) return db - da;  // descending = far first (painter's algorithm)
  return a - b;  // stable tie-break: lower lane index first
});
```

### C-25: Buffer Preallocations

```typescript
// Module-level persistent buffers
let sortBuffers = {
  indices: new Uint32Array(0),
  screenPos: new Float32Array(0),
  radius: new Float32Array(0),
  depth: new Float32Array(0),
  color: new Float32Array(0),
  rotation: new Float32Array(0),
  scale2: new Float32Array(0),
};

function ensureBufferCapacity(count: number): void {
  if (sortBuffers.indices.length < count) {
    sortBuffers.indices = new Uint32Array(count);
    sortBuffers.screenPos = new Float32Array(count * 2);
    sortBuffers.radius = new Float32Array(count);
    sortBuffers.depth = new Float32Array(count);
    // color, rotation, scale2 grow separately based on actual need
  }
}
```

**Key design decision:** The function currently returns new arrays. After this change it returns *views* into preallocated buffers. Callers must consume immediately (before next frame). Current callers do this already — they build DrawOps from the result in the same tick.

The return type stays the same (caller sees Float32Array). The caller doesn't know it's a subarray view.

### C-26: Monotone Check

```typescript
// Before sort, check if already ordered (common case: flat layouts)
let alreadyOrdered = true;
let prevVisibleDepth = -Infinity;  // Start with -Inf so first visible always passes
for (let i = 0; i < count; i++) {
  if (visible[i] === 1) {
    if (depth[i] > prevVisibleDepth) {
      // depth increased = ascending = NOT far-to-near
      alreadyOrdered = false;
      break;
    }
    prevVisibleDepth = depth[i];
  }
}

if (alreadyOrdered) {
  // Skip sort — just compact visible instances in existing order
  // ...
}
```

Wait — the check needs to verify *descending* (far-to-near). So if `depth[i] > prevVisibleDepth`, it's *ascending* at that point, meaning NOT ordered. Let me re-examine...

Actually for far-to-near (decreasing depth), we want each visible depth ≤ previous visible depth. So the violation is `depth[i] > prevVisibleDepth`:
- Start: `prevVisibleDepth = +Infinity`
- For each visible i: if `depth[i] > prevVisibleDepth`, NOT ordered
- Update: `prevVisibleDepth = depth[i]`

```typescript
let alreadyOrdered = true;
let prevVisibleDepth = Infinity;
for (let i = 0; i < count; i++) {
  if (visible[i] === 1) {
    if (depth[i] > prevVisibleDepth) {
      alreadyOrdered = false;
      break;
    }
    prevVisibleDepth = depth[i];
  }
}
```

### Test Updates (Level 7)

The key assertions to flip:

1. **Unit test "front to back"**: Currently expects [0.1, 0.3, 0.5, 0.9]. Change to [0.9, 0.5, 0.3, 0.1] and update screen position/color expectations to match.

2. **Stability test**: Unchanged — equal depths still preserve original order regardless of direction.

3. **Visibility test**: Visible instances sorted descending: depths [0.3, 0.4, 0.5] → expect [0.5, 0.4, 0.3].

4. **Ortho integration**: `toBeGreaterThanOrEqual(result.depth[i-1])` → `toBeLessThanOrEqual(result.depth[i-1])` for descending.

5. **Perspective integration**: Same flip.

6. **E2E pipeline test**: Same flip for the monotonicity check.

### DoD File Update

In `design-docs/_new/3d/dod/_completed/level-07-depth-culling.md`:
- The INVARIANT block says "Instances are ordered by depth (front-to-back, stable)"
- Change to: "Instances are ordered by depth (far-to-near / painter's algorithm, stable)"
- Test descriptions that say "front to back" → "far to near"

## Edge Cases

- **All same depth (z=0):** Monotone check passes (trivially non-increasing). Sort skipped. Stable order preserved. This is the most common case (2D layouts).
- **Single instance:** Monotone check trivially passes. No sort needed.
- **All invisible:** `indices` array is empty. No sort. Return count=0.
- **Mix of visible/invisible:** Monotone check only examines visible instances. Correct.
