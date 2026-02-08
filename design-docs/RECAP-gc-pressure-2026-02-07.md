# Recap: GC Pressure Fix Session — 2026-02-07

## Specific Question: Can we eliminate `new Array(n)` in materializeKernel?

**Yes, but it requires care because `materializeValueExpr` is recursive.**

The remaining allocations are in `src/runtime/ValueExprMaterializer.ts`:

```
construct (line ~98):  new Array<Float32Array>(componentCount)   // 2-4 elements
zip (line ~188):       new Array<Float32Array>(inputCount)       // 2-3 elements
broadcast (line ~198): new Array<number>(compCount)              // 2-4 elements
zipSig (line ~217):    new Array<number>(sigCount)               // 1-3 elements
```

**Why module-level buffers don't work here:** `materializeValueExpr` recurses — a zip input can be another zip, a construct can contain a zip, etc. A shared module-level array would be overwritten by the recursive call.

**Three viable approaches:**

1. **Depth-indexed scratch pool** — Pre-allocate arrays per recursion depth. Add a `depth` parameter to `materializeValueExpr`, use `scratchPool[depth]`. Max depth is bounded by the expression tree (typically < 10). Downside: threading a depth parameter through all calls.

2. **Per-expression pre-allocated scratch** — At compile time, the compiler knows each expression's arity. Add a `scratch: Float32Array[] | number[]` field to each `ValueExprKernel` in the IR, pre-allocated during program setup (in `CompileOrchestrator` or a post-compile pass). This is zero-alloc at runtime. Downside: mixes buffer allocation with IR structure.

3. **Accept the cost** — These allocate once per expression per frame, NOT per instance. With ~20 expressions, that's ~20 tiny arrays/frame = ~1200/sec at 60fps. Each is 2-4 elements. This is orders of magnitude less GC pressure than the per-instance allocations we already fixed (which were ~240K/sec). Practically, this is negligible.

**Recommendation:** Option 3 (accept) unless profiling shows it matters. The per-instance fixes (`applyZip`, `applyZipSig`, `applyMap`, `hslToRgb`) eliminated >99% of the hot-path allocations. These per-expression allocations are in the noise.

If you DO want to pursue it, option 1 (depth-indexed pool) is simplest:
```typescript
const _scratchBufs: Float32Array[][] = Array.from({length: 16}, () => []);
const _scratchNums: number[][] = Array.from({length: 16}, () => []);

// In materializeValueExpr, add depth param, use _scratchBufs[depth]
```

---

## Current Task Status

### Completed this session:
1. **Multi-window frame timing** (`src/stores/DiagnosticsStore.ts`, `src/ui/components/app/DiagnosticConsole.tsx`)
   - 1s/10s/1m/5m/life windows with mean/min/max for fps, ms/frame, jitter, dropped
   - Lifetime accumulator survives history eviction
   - History buffer: 1500 snapshots (5 min at 5Hz)
   - Empty snapshot filtering (frameCount=0 / avgDelta<=0 discarded)

2. **Jank event log** (`src/stores/DiagnosticsStore.ts`, `src/services/AnimationLoop.ts`, `src/ui/components/app/DiagnosticConsole.tsx`)
   - Captures timing breakdown when delta > 500ms (JANK_THRESHOLD_MS)
   - Shows: delta, exec, render, browser gap
   - Confirmed janks are browser/GC (gap >> exec+render)

3. **GC pressure fixes** (the main deliverable):
   - `src/runtime/ValueExprMaterializer.ts`: Module-level `_mapArgs`, `_zipArgs`, `_zipSigArgs` buffers; `.map()` → imperative loops; `.slice()` → `.subarray()` view; inlined `hslToRgb`
   - `src/runtime/RenderAssembler.ts`: `ops.push(...spread)` → for loop; `new Uint8Array(topology.verbs)` → `getCachedVerbs()` with `_topologyVerbsCache`;
   - `src/render/canvas/Canvas2DRenderer.ts`: `setLineDash([])` → `EMPTY_DASH` singleton; `dashPattern.map()` → reusable `_dashBuffer`

### Remaining work on current task:
- **Observe whether jank frequency decreases** after the GC pressure fixes
- The per-expression `new Array(n)` allocations (see above) — low priority
- `rgbaToCSS()` in Canvas2DRenderer creates a string per instance per frame — inherent to Canvas 2D API, can't avoid without switching to WebGL or caching color strings

## Larger Goal Context
- Branch: `bmf_type_system_refactor`
- Primary goal is type system spec merge, not performance
- This was a side quest to fix animation jank that was interfering with development

## Known Test Status
- **All 177 test files pass, 2459 tests pass**
- **No expected failures from this work**
- Pre-existing: `rect-mosaic.hcl` test failure (unrelated, existed before)
- Pre-existing: 6 skipped test files, 25 skipped tests, 2 todo tests

## No Architectural Issues
- The module-level mutable buffers (`_zipArgs` etc.) are safe because JS is single-threaded. If this ever moves to workers, these would need to be per-worker. Worth noting but not a problem now.
- The `_topologyVerbsCache` Map grows monotonically but is bounded by topology count (typically < 20 topologies). No cleanup needed.
