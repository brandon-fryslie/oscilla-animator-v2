# WebGPU-Complete Gap Analysis Summary

**Spec**: `docs/WebGPU-Complete/` (21 specs P0-0 through P6-1 + 6 Shape specs)
**Analysis date**: 2026-03-12
**Analysis type**: FRESH

## Grand Totals

| Category | P0 | P1 | P2 | P3 | P4-6 | Shapes | **Total** |
|----------|----|----|----|----|------|--------|-----------|
| CRITICAL | 0 | 3 | 4 | 2 | 2 | 5 | **16** |
| TO-REVIEW | 8 | 6 | 15 | 10 | 12 | 13 | **64** |
| UNIMPLEMENTED | 8 | 14 | 5 | 12 | 20 | 24 | **83** |
| TRIVIAL | 6 | 5 | 12 | 0 | 12 | 7 | **42** |

**Phase 0 is in strong alignment** (zero critical items).
**Phases 4-6 are mostly future work** (P6-1 physics is entirely unimplemented by design).
**Shapes 3-5 are entirely unimplemented** (ribbon, SDF, text -- future shape types).

---

## Priority Work Queue

### Priority 1: CRITICAL items with NO dependencies (start immediately)

| # | Spec | Item | Files | Effort |
|---|------|------|-------|--------|
| 1 | P2-2 | **Dual IR Hierarchies**: Two parallel Naga IR type systems (`naga-types.ts` Family A vs `ScheduleNagaLowering.ts` Family B). Family A (`NagaBuilder`+`NagaValidator`) is dead code on active path. `[LAW:one-source-of-truth]` violation. | `src/compiler/ir/naga-emitter/naga-types.ts`, `NagaBuilder.ts`, `NagaValidator.ts`, `ScopeEnvironment.ts` | M - audit usage, delete or consolidate |
| 2 | P2-4 | **ScopeEnvironment Dead Code**: `ScopeEnvironment.ts` has zero imports. Lexical scope isolation not enforced. | `src/compiler/ir/naga-emitter/ScopeEnvironment.ts` | S - delete or wire in |
| 3 | P2-4 | **Missing Bounds Clamping on Dynamic Buffer Reads**: `NagaBuilder.bufferRead()` and `ScheduleNagaLowering` buffer_load don't inject `arrayLength` + `min()` clamping. Fluid bundle has correct pattern. | `src/compiler/ir/naga-emitter/NagaBuilder.ts`, `ScheduleNagaLowering.ts`, ref: `fluid-gpu-bundle.ts:433-437` | S - add clamping |
| 4 | P3-4 | **MSAA Not Implemented**: `render.rs:24,150` uses `sample_count: 1`. TS constant `renderMsaaSampleCount: 4` exists in `shaders.ts:55` but Rust renderer ignores it. No MSAA texture, no resolve target. | `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs` | M - MSAA pipeline + resize recreation |
| 5 | P5-3 | **forbidden-patterns.test.ts Missing**: Referenced in CLAUDE.md and spec as architectural guardrail. Does not exist on disk. | `src/__tests__/forbidden-patterns.test.ts` (create) | S - create test file |

> **Context files**: `critical/context-P2-2-dual-ir-hierarchies.md`, `critical/context-P2-4-scope-isolation.md`, `critical/context-P2-4-bounds-clamping.md`, `critical/topic-P3-4-render-pass-context.md`, `critical/context-P5-3-phased-rollout.md`

### Priority 2: CRITICAL items with dependencies

| # | Spec | Item | Depends On | Files |
|---|------|------|------------|-------|
| 6 | P1-1 | **State Loss on Pipeline Rebuild**: `engine.rs:790-842` zeros all GPU state buffers on pipeline rebuild. Destroys particle positions, velocities, all physics state on graph edits. | Arena migration strategy (P1-1 unimpl.) | `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` |
| 7 | P1-3 | **CPU Owns Dynamic Draw Counts**: `DrawPrepSinkTablePacker.ts` CPU-authors instance counts. Draw-prep compute is memcpy. Violates spec's "CPU never writes dynamic draw counts" invariant. | GPU-side atomic counters (P1-1 #8) | `src/runtime/DrawPrepSinkTablePacker.ts`, `src/render/webgpu/shaders.ts:254-284` |
| 8 | P1-1 | **Arena Counter Slot Integration Missing**: No GPU-side atomic counter for draw-prep to read GPU-computed visibility/alive counts. | Requires design decision on counter architecture | `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` |
| 9 | P3-4 | **No Transparent Pass**: Single render pass with `depth_write_enabled: true`. Spec requires separate transparent pass with depth write OFF. | Material class bucketing (Shapes 1 #14) | `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:115-153` |
| 10 | P2-3 | **WGSL String Round-Trip**: Naga shim emits WGSL strings then re-parses with `naga::front::wgsl::parse_str` instead of direct `naga::Module` serialization. Works but contradicts spec's "zero syntax errors by construction." | P2-2 IR consolidation (#1) | `src/compiler/wasm/rust/oscilla-naga-shim/` |
| 11 | P5-3 | **Phase B Acceptance Tests Missing**: All 4 referenced Phase B tests don't exist. | #5 (forbidden-patterns) | Need to determine test specs |

> **Context files**: `critical/context-P1-1-state-loss-on-rebuild.md`, `critical/context-P1-3-cpu-owned-draw-counts.md`, `critical/context-P1-1-arena-counter-integration.md`, `critical/context-P2-3-naga-shim-architecture.md`

### Priority 3: CRITICAL items from Shapes (depend on foundation)

| # | Spec | Item | Depends On |
|---|------|------|------------|
| 12 | Shapes 0 | **CPU-side draw-prep bottleneck**: Draw-prep compute shader (`shaders.ts:254-284`) is a memcpy pass-through. All draw-prep logic on CPU. | #7 GPU-driven draw counts |
| 13 | Shapes 1 | **Shape bank geometry mutable during frame loop**: `ValueExprMaterializer.ts:172-196` writes shape bank headers every frame. Rust renderer mutates `shape_bank_words` in place. Violates immutability invariant. | Shape bank lifecycle design |
| 14 | Shapes 1 | **No material class bucketing**: `ShapeBankHeaderWord.MaterialClass` always 0. No material system. Blocks SDF and text rendering. | Render pipeline architecture |
| 15 | Shapes 2 | **No GPU-side Bezier evaluation**: All Bezier math on CPU in `ParametricCurveGeometry.ts`. Vertex shader receives pre-computed vertices, not control points. | #16 Naga vertex shader generation |
| 16 | Shapes 2 | **No Naga vertex shader generation**: Naga shim generates compute shaders only. No vertex shader pipeline. | #1 IR consolidation |

---

## TO-REVIEW Items (user decision needed)

These items are implemented differently from spec but may be better. User must decide: accept current impl, update spec, or fix code.

### Architecture Improvements (likely keep, update spec)

| Spec | Item | Current vs Spec |
|------|------|-----------------|
| P0-0 | SharedArrayBuffer input plane | SAB+Atomics vs queue.writeBuffer. Lower latency. |
| P1-1 | Multi-buffer architecture | Separate GPU buffers vs monolithic arena. Better usage flags + resizing. |
| P1-1 | Uniform buffer for global header | UNIFORM vs STORAGE. Better GPU access pattern. |
| P3-2 | Multi-pass simulation | Chained compute passes with auto ping-pong. Spec assumes single pass. |
| P3-3 | Table-driven draw prep | Storage buffer sink table vs per-dispatch uniforms. More data-driven. |
| P3-5 | Ping-pong by pass count parity | Pass count drives index alternation, not frame count. Correct for multi-pass. |
| P5-1 | Singleton BootService | Service class vs runtime-scoped context. More idiomatic. |

### Potentially Suboptimal (may need fixing)

| Spec | Item | Concern |
|------|------|---------|
| P2-3 | No WASM preloading | Cold start penalty on first compile |
| P4-1 | Single-buffered readback | Spec's double-buffered "spyglass" avoids stalls |
| P4-1 | Whole-buffer readback | Spec's "surgical slice" copies only probe offsets |
| P4-1 | Readback rate 5-6Hz vs spec's 15-30Hz | Debug UI responsiveness |
| P5-2 | No Naga error humanizer | Raw Naga errors shown to users |
| P5-2 | No block-level red border highlighting | Errors shown in panel but not on graph nodes |

> **Full list**: 64 items across all `to-review/topic-*.md` files

---

## UNIMPLEMENTED Items by Tier

### Tier A: Blocks higher-priority work (do when unblocking CRITICAL/TO-REVIEW)

| Spec | Item | Blocks |
|------|------|--------|
| P1-1 | Arena migration compute dispatch | #6 State loss on rebuild |
| P1-1 | GPU-side atomic counter mechanism | #7, #8, #12 GPU-driven draw counts |

### Tier B: Standalone features (do after CRITICAL resolved)

| Spec | Item |
|------|------|
| P0-2 | Missing test files (temporal-comparison, executeFrameStepped) |
| P1-2 | Shape allocator service, dirty-slice uploads, default topology pre-loading |
| P3-1 | MIDI ring buffer, real frame-timing dt, audio frequency bands |
| P3-2 | Texture/sampler bindings from compute, atomic accumulation buffer |
| P3-4 | Procedural SDF fragment path |
| P3-5 | Reset/rewind mechanism, offline/video export |
| P4-1 | GPU-side histogram, NaN/Inf auto-pause |
| P5-2 | GPU safe mode, cascading error root cause analysis, mini-map error dots |

### Tier C: Entire feature systems (future work)

| Spec | Item | Size |
|------|------|------|
| Shapes 3 | **Continuous Ribbon** (trail/ribbon system) | 6 items |
| Shapes 4 | **Procedural Volume / SDF** (fragment-driven SDFs) | 7 items |
| Shapes 5 | **Text/Glyph Hybrid Rendering** (MSDF atlas + CPU shaping) | 11 items |
| P6-1 | **GPU Physics Engine** (XPBD, spatial hashing, constraint solver) | 7 items |

---

## Dependency Graph (CRITICAL items only)

```
P2-2 Dual IR (#1) ─────────────────────────┐
                                            ├─► P2-3 WGSL Round-Trip (#10)
P2-4 ScopeEnv (#2) ──► (standalone)        ├─► Shapes 2 Vertex Shader Gen (#16)
                                            │       └─► Shapes 2 GPU Bezier (#15)
P2-4 Bounds Clamp (#3) ──► (standalone)    │
                                            │
P3-4 MSAA (#4) ──► (standalone)            │
                                            │
P5-3 forbidden-patterns (#5) ──► P5-3 Phase B Tests (#11)
                                            │
P1-1 Counter Integration (#8) ─┐           │
                                ├─► P1-3 CPU Draw Counts (#7)
P1-1 State Loss (#6) ─────────┤       └─► Shapes 0 CPU Draw-Prep (#12)
  (needs migration dispatch)    │
                                │
Shapes 1 Mutability (#13) ──► (standalone, design decision)
Shapes 1 Material Class (#14) ──► P3-4 Transparent Pass (#9)
```

## Recommended Execution Order

### Sprint 1: Low-Hanging CRITICAL Fixes
1. Delete dead Naga IR code (P2-2 #1, P2-4 #2) -- `[LAW:one-source-of-truth]`
2. Add bounds clamping to buffer reads (P2-4 #3)
3. Create `forbidden-patterns.test.ts` (P5-3 #5)
4. Implement MSAA in Rust renderer (P3-4 #4)

### Sprint 2: GPU-Driven Draw Pipeline
5. Design GPU-side atomic counter architecture (P1-1 #8)
6. Move draw count ownership to GPU (P1-3 #7)
7. Make draw-prep compute shader autonomous (Shapes 0 #12)
8. Add transparent render pass (P3-4 #9, after material bucketing)

### Sprint 3: State Preservation + Shape Improvements
9. Arena migration compute dispatch (P1-1 unimpl)
10. Fix state loss on pipeline rebuild (P1-1 #6)
11. Shape bank immutability during frame loop (Shapes 1 #13)
12. Material class bucketing (Shapes 1 #14)

### Sprint 4: Compiler IR + Shader Generation
13. Naga shim architecture (P2-3 #10, if desired)
14. Vertex shader generation pipeline (Shapes 2 #16)
15. GPU-side Bezier evaluation (Shapes 2 #15)

### Future: Feature Systems
- Shapes 3 (Ribbon), Shapes 4 (SDF), Shapes 5 (Text), P6-1 (Physics)
- Observability improvements (P4-1)
- Error UX (P5-2)

---

## Files Index

All findings are in `.agent_planning/gap-analysis-webgpu/`:

```
critical/     - 23 files (topic + context per item)
to-review/    - 37 files (topic + context per item)
unimplemented/ - 37 files (topic + context per item)
trivial/      - 24 files (topic only, no context)
```
