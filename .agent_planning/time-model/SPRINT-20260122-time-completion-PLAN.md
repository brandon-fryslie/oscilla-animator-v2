# Sprint: time-completion - Time System Gaps & Phase Continuity

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Close remaining gaps in the time-model implementation: fix palette evaluation, add pulse output, implement phase continuity on period change (hot-swap), and add comprehensive tests. Does NOT include rails (separate topic) or changing phase to a distinct PayloadType (intentionally kept as float+unit:phase01).

## Current State Assessment

**Already implemented:**
- Block definition: periodAMs, periodBMs, palette, energy outputs ✅
- Pass 3: extracts periods, generates palette/energy signals ✅
- TimeModelIR: periodAMs/periodBMs fields ✅
- timeResolution.ts: HSV palette, sine energy, independent periods ✅
- SignalEvaluator: energy dispatched correctly ✅
- ScheduleExecutor: palette stored in objects map ✅

**Gaps:**
1. Palette signal evaluation returns `0` (object slot key) but downstream blocks have no mechanism to read RGBA from it — only renderer uses objects map
2. Pulse output not exposed in block definition
3. Pulse signal not generated in pass3-time (set to `null`)
4. Phase continuity offsets never updated on period change
5. No dedicated tests for time resolution computations

## Work Items

### P0: Time Resolution Tests

**File:** `src/runtime/__tests__/timeResolution.test.ts` (new)

**Acceptance Criteria:**
- [ ] Test palette HSV: phaseA=0 → red-ish, phaseA=0.33 → green-ish, phaseA=0.66 → blue-ish
- [ ] Test energy sine: phaseA=0 → 0.5, phaseA=0.25 → 1.0, phaseA=0.5 → 0.5, phaseA=0.75 → 0.0
- [ ] Test independent periods: periodAMs=1000, periodBMs=2000 → phaseB cycles at half rate
- [ ] Test pulse: fires when phase wraps (0.95 → 0.05), doesn't fire on normal advance
- [ ] Test wrapPhase: handles negative, > 1.0, exactly 1.0
- [ ] Test dt calculation: correct delta between frames
- [ ] Test first frame: dt=0, phases initialized correctly

**Technical Notes:**
- Call `resolveTime()` directly with controlled inputs
- Use `createTimeState()` for initial state
- Call sequentially to test multi-frame behavior (wrap detection, dt)

### P1: Pulse Output

**Files:**
- `src/blocks/time-blocks.ts` — add pulse output port
- `src/compiler/passes-v2/pass3-time.ts` — generate pulse signal (not null)
- `src/runtime/SignalEvaluator.ts` — already handles pulse case ✅

**Acceptance Criteria:**
- [ ] TimeRoot block has `pulse` output: `{ label: 'Pulse', type: canonicalType('float') }`
- [ ] pass3-time.ts generates `pulse` SigExprId (not null)
- [ ] Block lowering allocates a slot for pulse and emits it in outputsById
- [ ] SignalEvaluator returns `state.time.pulse` (already works)
- [ ] Test: pulse is 1.0 on phase wrap frame, 0.0 otherwise

**Technical Notes:**
- Spec says pulse is `unit` payload with `discrete` temporality. However, our signal system is scalar. For v1, pulse is a float (0.0 or 1.0) with continuous temporality. A proper `unit`/`discrete` model would require event system infrastructure (Phase 3). Use `canonicalType('float')` for now — this is a pragmatic decision, not a spec violation per se (the value semantics are preserved).
- The `pulse: null` in pass3-time.ts means no signal is generated. Change to generate a real SigExprId.

### P2: Palette Signal — Multi-Stride Slot Architecture

**Decision**: Option A (4 consecutive f64 slots). Objects Map is not viable — Maps don't survive the IR boundary. Color signals MUST flow through the normal f64 slot system.

**Files:**
- `src/compiler/ir/program.ts` — add `stride` to SlotMetaEntry
- `src/compiler/ir/IRBuilderImpl.ts` — `allocTypedSlot` reserves stride-many f64 entries for multi-component types
- `src/compiler/passes-v2/pass3-time.ts` — palette signal uses color-typed slot (stride=4)
- `src/runtime/ScheduleExecutor.ts` — `evalSig` step handles stride>1 (write multiple f64 entries); remove objects Map palette hack
- `src/runtime/SignalEvaluator.ts` — palette case returns r component (slot+0); new `evaluateColorSignal` returns all 4 to executor
- `src/core/canonical-types.ts` — add `payloadStride(payload: PayloadType): number` utility

**Acceptance Criteria:**
- [ ] `SlotMetaEntry` has `readonly stride: number` field (default 1, color=4, vec2=2)
- [ ] `payloadStride()` utility maps PayloadType → stride (float=1, int=1, vec2=2, color=4, etc.)
- [ ] `allocTypedSlot(canonicalType('color'))` reserves 4 consecutive f64 entries (slotCounter += 4)
- [ ] `slotMeta` generation emits stride for each entry
- [ ] `pass3-time` palette allocation uses `allocTypedSlot(canonicalType('color'))` instead of bare `allocSlot()`
- [ ] ScheduleExecutor `evalSig` for stride>1 slots writes all components:
  ```
  f64[offset+0] = r, f64[offset+1] = g, f64[offset+2] = b, f64[offset+3] = a
  ```
- [ ] ScheduleExecutor removes `state.values.objects.set(PALETTE_SLOT, time.palette)` — palette lives in f64 only
- [ ] SignalEvaluator `time.palette` case: either:
  - (a) Executor special-cases palette (calls `resolveTime`, writes 4 values itself without going through evaluateSignal), OR
  - (b) New function `evaluateColorSignal()` returns `{r,g,b,a}` for multi-component expressions
- [ ] Debug system reads color from 4 consecutive f64 slots (no objects map dependency)
- [ ] Renderer reads palette from f64 slots (adapter if needed for RenderPassIR)
- [ ] Existing test for palette HSV cycle passes (values now in f64 instead of objects map)

**Technical Notes:**
- **evaluateSignal returns number** — this is the core constraint. Two sub-approaches for the executor:

  **(a) Executor-level special case** (simpler, recommended for v1):
  The palette is a time-derived signal. The ScheduleExecutor already has direct access to `time.palette` from `resolveTime()`. Instead of emitting an `evalSig` step for palette, emit a new step kind `evalColor` that writes 4 f64 entries directly. This avoids changing `evaluateSignal`'s return type.

  **(b) Multi-component evaluator** (more general, needed for vec2 eventually):
  Add `evaluateMultiSignal(expr, signals, state): number[]` that returns stride-many values. The `evalSig` executor branch checks stride and calls the appropriate evaluator. This generalizes to vec2/vec3 but is more work now.

  **Recommendation: (a) for palette specifically.** Palette is the only multi-component signal generated by the time model. When vec2 signals through scalar connections land, we can implement (b) as a generalization. For now, a `writeTimeColor` step (or special-casing palette in the time resolution write path) is sufficient.

- **Stride derivation**: stride is determined by `PayloadType` in `CanonicalType`. The function `payloadStride()` is the canonical mapping:
  ```
  float→1, int→1, bool→1, vec2→2, vec3→3, color→4, shape2d→8
  ```

- **f64 array sizing**: The f64 array is allocated as `new Float64Array(program.slotMeta.length)` currently. With stride, it needs to be `sum(slotMeta[i].stride)`. OR: slotMeta.length stays the same (one entry per logical slot) but the offset accounts for stride of prior slots.

- **Backward compatibility**: Existing scalar slots have stride=1, so offset calculation remains `slotIndex` for them. Multi-stride slots shift subsequent offsets. The `slotMeta` generation pass must account for cumulative stride.

- **Remove objects Map palette path**: After this change, `state.values.objects` should NOT be used for palette. The PALETTE_SLOT constant and the `objects.set()` call in ScheduleExecutor are deleted.

### P3: Phase Continuity on Period Change

**Files:**
- `src/runtime/timeResolution.ts` — update offsets when period changes
- `src/runtime/ScheduleExecutor.ts` — pass previous TimeModel for comparison

**Acceptance Criteria:**
- [ ] When periodAMs changes between compilations, phaseA offset is updated to prevent discontinuity
- [ ] When periodBMs changes, phaseB offset is similarly updated
- [ ] Formula: `new_offset = current_phase - (tMs / new_period) % 1.0`
- [ ] Offset is computed at the moment of hot-swap (in ScheduleExecutor when TimeModel changes)
- [ ] Phase value before and after hot-swap is identical (within floating point)
- [ ] Test: change periodAMs from 1000→2000 at t=500ms, verify phase doesn't jump
- [ ] Test: multiple period changes accumulate offsets correctly
- [ ] Test: offset wraps correctly (stays in [0,1))

**Technical Notes:**
- `resolveTime` already uses `timeState.offsetA` and `timeState.offsetB` — they're just never set
- The right place to compute the offset is when the ScheduleExecutor swaps to a new compiled program (hot-swap path). At that point, it has the old TimeModel and new TimeModel.
- Need to add `previousTimeModel` tracking to ScheduleExecutor (or RuntimeState)
- The formula ensures: `wrapPhase(tMs/newPeriod + newOffset) === wrapPhase(tMs/oldPeriod + oldOffset)`
  → `newOffset = wrapPhase(tMs/oldPeriod + oldOffset) - (tMs/newPeriod) % 1.0`
  → Simplifies to: `newOffset = currentPhase - (tMs / newPeriod) % 1.0`
- Edge case: if newPeriod is 0 or negative, clamp to a minimum (e.g., 1ms)

### P4: Verification

**Acceptance Criteria:**
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run test` — all tests pass (existing + new)
- [ ] Start dev server, verify:
  - phaseA/phaseB cycle at expected rates
  - Energy oscillates smoothly
  - Palette cycles through HSV rainbow (visible in debug panel once DebugMiniView integration lands)
  - Pulse fires on wrap (observable via debug probe when pulse output is connected)
  - Change period param in inspector → phase continues smoothly (no jump)

## Dependencies

- CanonicalType system (complete)
- ScheduleExecutor hot-swap path (exists)
- TimeState with offset fields (exists, unused)

## Risks

| Risk | Mitigation |
|------|-----------|
| Multi-stride slots shift subsequent slot offsets | slotMeta offset already computed by compiler, not assumed by runtime. Offset generation accounts for cumulative stride. |
| f64 array size changes | Size = sum of all strides (not count of slots). Computed from slotMeta at allocation time. |
| Renderer currently reads palette from objects map | Update renderer to read from 4 consecutive f64 slots. RenderAssembler adapts. |
| Phase continuity offset accumulates error | Use double precision; error is negligible over practical timescales |
| Pulse as float breaks future discrete event system | Explicit tech debt note; pulse becomes proper event when event system lands |
| Period change during wrap frame causes glitch | Offset computation uses pre-wrap phase value |

## Out of Scope

- Rails (time, phaseA, phaseB, pulse, palette) — separate buses-and-rails topic
- Phase as distinct PayloadType — intentionally kept as float+unit:phase01
- Finite TimeRoot — removed from spec
- Audio-reactive energy — Phase 3
- Discrete event model for pulse — Phase 3
