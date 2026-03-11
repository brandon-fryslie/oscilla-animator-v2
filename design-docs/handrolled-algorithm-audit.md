# Handrolled Algorithm Audit

> **Date**: 2026-02-24
> **Context**: After replacing PathTessellator (earcut), noise3 (simplex-noise), and curve flattening (bezier-js), we audited the full codebase for other handrolled algorithms that could mask errors or silently degrade.

## Risk Levels

- **CRITICAL** — Silent wrong answers or data corruption possible under normal usage
- **HIGH** — Failure modes exist that produce wrong output without crashing
- **MEDIUM** — Fragile but currently functional; breakage requires unusual input
- **LOW** — Well-tested or simple enough that risk is minimal

---

## CRITICAL

### 1. Cardinality Solver — `src/compiler/frontend/cardinality/solve.ts`

**What it does**: Union-find solver that determines whether each port carries one value (signal) or many (field). Merges equivalence classes across edges, propagates evidence from instance blocks, resolves ambiguity.

**Risk factors**:
- ~600 lines of hand-written union-find with instance unification
- `CardinalityVar` sentinel values (`UNRESOLVED = -1`) are numeric, not typed — off-by-one or sign confusion could silently resolve to wrong cardinality
- `mergeEvidence()` has subtle precedence rules (explicit > inferred > default) that are easy to break when adding new block types
- Evidence-free groups default to `one` (signal) — if evidence propagation has a bug, fields silently downgrade to signals and produce scalar where arrays are expected
- Instance unification (`unifyInstances`) merges variable groups across blocks; a missed merge means two blocks that should share cardinality end up with different values

**Silent failure mode**: A field port resolved as signal produces a single scalar instead of an array. Downstream field operations read garbage indices. No crash — just wrong animation.

**Mitigation**: Trace mode exists (Settings → Debug → Trace Cardinality Solver). Consider adding a backend assertion that field-typed slots actually contain arrays at runtime.

---

### 2. Payload/Unit Solver — `src/compiler/frontend/payload-unit/solve.ts`

**What it does**: Union-find solver for payload types (float, bool, vec2, vec3, color, phase01...) and unit types (none, angle, time, space...) across the graph.

**Risk factors**:
- `merge()` function must be commutative and associative — if it isn't, solver results depend on edge visitation order (non-deterministic)
- `requirePayloadIn` constraints interact with `payloadEq` — if a group has conflicting constraints, the error message identifies the wrong origin
- `BlockPayloadMetadata.unitBehavior` auto-derivation in `extract-constraints.ts` creates implicit vars — a block that should be `requireUnitless` but lacks the annotation silently permits unit propagation
- Finalization defaults: unresolved payload → float, unresolved unit → none. If a constraint was dropped by a bug, the solver silently picks defaults instead of reporting an error

**Silent failure mode**: Two ports that should share a type end up in separate equivalence classes. Each resolves to its default independently. No type error reported, but runtime operations assume wrong types.

**Mitigation**: Add a post-solve pass that verifies every edge connects ports with compatible resolved types (currently this is implied but not explicitly checked).

---

### 3. Frame Executor Phase Boundary — `src/runtime/ScheduleExecutor.ts`

**What it does**: Executes the compiled schedule in two phases per frame: Phase 1 reads previous state + evaluates signals, Phase 2 writes new state.

**Risk factors**:
- Phase boundary is enforced by schedule ordering (compiler places writes after reads), not by a mechanical runtime check
- If the scheduler has a bug that places a write before its corresponding read, the executor will happily execute it — reading the current frame's write instead of previous frame's state
- This would break the one-frame-delay guarantee that all stateful blocks (UnitDelay, Lag, Phasor, Accumulator) depend on
- No runtime assertion verifies that phase 2 steps don't read from slots written in phase 1

**Silent failure mode**: Feedback loops read their own writes within the same frame. Animation runs but stateful blocks (delay, lag, accumulator) have subtly wrong timing — off by one frame in some paths.

**Mitigation**: Add a debug-mode runtime check that tracks which slots have been written in phase 1 and asserts phase 2 reads don't touch them.

---

## HIGH

### 4. Hot-Swap State Migration — `src/runtime/StateMigration.ts`

**What it does**: When the graph changes during live editing, maps old runtime state to new schedule's slot layout. Preserves continuity of stateful blocks.

**Risk factors**:
- Lane mapping between old and new field state: if cardinality changes (e.g., instance count grows), lanes are mapped by index — no identity tracking
- Stride mismatch: if a port's payload type changes (e.g., float → vec3), the migration copies the wrong number of floats per lane. Currently handled by type comparison, but a missed case produces buffer overread
- Migration validation checks shape compatibility but not semantic compatibility — renaming a block can map state from an unrelated block if the slot shapes happen to match

**Silent failure mode**: After hot-swap, a stateful block reads state from a different block's previous frame. Animation doesn't crash but continuity is wrong — visual glitch that resolves over a few frames.

**Mitigation**: Add block-identity tracking to migration (map state by block ID + port name, not just slot index).

---

### 5. Continuity State Mapping — `src/runtime/ContinuityState.ts`

**What it does**: Maps continuity slots (delay state, accumulator state) between old and new compiled programs during hot-swap.

**Risk factors**:
- `mapContinuity()` uses slot name matching — if two blocks have identically-named continuity ports, state can cross-contaminate
- Array-valued continuity state: lane count changes aren't bounds-checked, buffer overflow into adjacent slots is possible if new program has fewer lanes
- Pruning logic removes state for blocks that no longer exist — if a block is temporarily removed and re-added (undo/redo), its continuity state is lost

**Silent failure mode**: Buffer overread during lane mapping — reads garbage from adjacent memory in the Float64Array. Produces NaN or unexpected values that propagate through the signal chain.

**Mitigation**: Bounds-check all lane copies. Add block-identity tracking for undo/redo continuity preservation.

---

### 6. Composite Expansion — `src/compiler/frontend/composite-expansion.ts`

**What it does**: Expands composite (nested) blocks into flat graph representation. Remaps IDs, wires boundary ports, validates nesting depth.

**Risk factors**:
- Partial expansion on error: if inner expansion fails, outer expansion may succeed with missing inner blocks — producing a graph with dangling edges
- ID collision: composite ID scheme (`cx:{path}:b:{innerId}`) depends on path uniqueness. Deeply nested composites with same inner block names could collide
- Nesting depth is validated at registration time but the MAX depth constant was removed in the rewrite — theoretically unbounded recursion is possible if registration validation is bypassed

**Silent failure mode**: Partial expansion produces a graph that compiles but is missing blocks. Missing block outputs resolve to default values (zero). Animation runs with missing components.

**Mitigation**: Add a post-expansion validation that all edges in the expanded graph have both endpoints present.

---

### 7. Patch DSL Parser — `src/patch-dsl/parser.ts`

**What it does**: Hand-written recursive descent parser for HCL-like patch files.

**Risk factors**:
- ~500 lines of manual tokenization and parsing
- No formal grammar — error recovery is ad-hoc
- String escaping in the lexer handles basic cases but could miss edge cases with nested quotes or unicode
- Error positions may point to the wrong token when recovery skips ahead

**Silent failure mode**: Malformed HCL silently drops a block or edge definition. Parser recovers and continues, producing a valid-looking but incomplete patch. User loads the patch and wonders why blocks are missing.

**Mitigation**: Parser already collects diagnostics. Add a round-trip test: parse → serialize → parse again and assert equality. This catches any silent drops.

---

## MEDIUM

### 8. Expression Parser — `src/patch-dsl/expression-parser.ts`

**What it does**: Parses mathematical expressions in patch DSL (e.g., `sin(time * 2.0) + 0.5`).

**Risk factors**:
- Operator precedence is hardcoded in the recursive descent structure — adding operators requires careful placement
- Unary minus handling in nested contexts (e.g., `(-x * -y)`) has edge cases
- No explicit operator precedence table to audit against

**Current state**: Works for all demo patches. Risk is primarily when adding new operators or expression features.

---

### 9. 3D Projection Kernels — `src/projection/perspective-kernel.ts`, `ortho-kernel.ts`

**What it does**: Transforms 3D world coordinates to 2D screen coordinates via perspective or orthographic projection.

**Risk factors**:
- Division by W coordinate (perspective divide) — degenerate camera setups can produce division by zero
- No near-plane clipping — points behind the camera project to inverted positions
- Matrix construction assumes specific handedness/coordinate conventions that aren't documented

**Silent failure mode**: Points behind camera appear mirrored. Division by near-zero W produces extremely large screen coordinates. Canvas draws off-screen — no crash, just invisible geometry.

**Mitigation**: Add near-plane clamping. Document coordinate conventions.

---

### 10. Arena Value Store — `src/runtime/RuntimeState.ts`

**What it does**: Flat Float64Array that stores all runtime values by slot index. Slots are addressed by offset.

**Risk factors**:
- Slot addressing is index-based with stride — a wrong stride produces reads from adjacent slots
- No bounds checking in release mode
- Packing mode (how vec3/color/etc. are stored in the flat array) is implicit, derived from payload type

**Silent failure mode**: Wrong stride reads partial data from the next slot. Produces plausible-looking but wrong values.

**Mitigation**: Debug-mode bounds checking exists but could be more thorough. Consider tagged slots in debug mode.

---

### 11. Schedule Executor Address Table — `src/runtime/ScheduleExecutor.ts`

**What it does**: Maps slot IDs to Float64Array offsets for the current frame.

**Risk factors**:
- Address table is rebuilt when schedule changes but cached otherwise
- If a hot-swap updates the schedule but the address table rebuild is skipped (race condition), old addresses point to wrong slots
- Stale address table produces silent wrong reads (no crash)

**Silent failure mode**: After hot-swap, executor reads from stale slot addresses for one or more frames. Values are wrong but finite. Self-corrects on next rebuild.

**Mitigation**: Add a generation counter to the address table and schedule. Assert they match before each frame.

---

### 12. IRBuilder ValueExpr Cache — `src/compiler/ir/IRBuilder.ts`

**What it does**: Caches identical value expressions to avoid duplicate IR nodes. Uses JSON.stringify as hash key.

**Risk factors**:
- `JSON.stringify` key ordering depends on object property insertion order — same logical expression constructed differently may miss cache
- Cache hits with wrong matches are impossible (equality check), but cache misses inflate IR size
- Not a correctness issue, but IR size affects schedule generation and runtime performance

**Current state**: Works correctly but could waste memory on large graphs. Low risk.

---

## LOW

### 13. Color Math — `src/runtime/kernels/color.ts`

**What it does**: OKLCH↔RGB conversion, color blending, gamma correction.

**Risk factors**: Well-known algorithms, straightforward implementation. Hue wrapping at 360° boundary is the main edge case and is handled.

**Assessment**: Fine as-is. Standard formulas, tested.

---

### 14. Tarjan's SCC — `src/compiler/backend/schedule-scc.ts`

**What it does**: Strongly connected component decomposition for cycle detection in the dependency graph.

**Risk factors**: Classic textbook algorithm. Implementation is ~80 lines. Well-tested.

**Assessment**: Fine as-is. Would not benefit from a library replacement.

---

### 15. BFS Reachability — `src/graph/adapters.ts`

**What it does**: BFS to find adapter paths between types.

**Risk factors**: Standard BFS. Small graph sizes (adapter type space is bounded).

**Assessment**: Fine as-is.

---

## Recommendations (Priority Order)

1. **Phase boundary assertion** (CRITICAL #3): Add debug-mode check that phase 2 doesn't read phase 1 writes. Low effort, high value — catches scheduler bugs before they become mysterious timing issues.

2. **Post-solve edge verification** (CRITICAL #2): After payload/unit solve, verify every edge connects compatible resolved types. Catches dropped constraints.

3. **Cardinality runtime assertion** (CRITICAL #1): In debug mode, assert that field-typed slots actually contain arrays and signal-typed slots contain scalars. Catches solver bugs at the boundary.

4. **Migration identity tracking** (HIGH #4): Track block identity through hot-swap. Map state by block ID + port name, not slot index.

5. **Continuity bounds checking** (HIGH #5): Bounds-check all lane copies during continuity mapping. Prevents buffer overread.

6. **Composite post-expansion validation** (HIGH #6): Assert all edges have both endpoints after expansion.

7. **Parser round-trip test** (HIGH #7): Parse → serialize → parse → assert equality for all demo HCL files.

---

## Summary

| Risk | Count | Key Theme |
|------|-------|-----------|
| CRITICAL | 3 | Solvers + phase boundary — wrong answers without crashing |
| HIGH | 4 | Hot-swap + parsing — state corruption or silent data loss |
| MEDIUM | 5 | Edge cases in math/addressing — wrong but rare |
| LOW | 3 | Standard algorithms — working fine |

The three library replacements we just completed (earcut, simplex-noise, bezier-js) were the right call — those were in active daily use and the PathTessellator was already visibly broken. The remaining items are more subtle: they work today but have failure modes that would produce wrong output without any indication of error.
