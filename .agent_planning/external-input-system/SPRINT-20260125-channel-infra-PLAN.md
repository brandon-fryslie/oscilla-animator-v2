# Sprint: channel-infra - Channel Infrastructure

Generated: 2026-01-25
Confidence: HIGH: 7, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260125.md

## Sprint Goal

Implement the generic external channel system infrastructure: write bus, snapshot, commit lifecycle, and IR/evaluator integration.

## Scope

**Deliverables:**
- ExternalWriteBus class with set/pulse/add methods
- ExternalChannelSnapshot class with getFloat/getVec2
- ExternalChannelSystem class (owns staging + committed + writeBus)
- Commit lifecycle (drain, fold, swap, clear pulses/accums)
- IR changes: SigExprExternal.which from literal union to string
- IRBuilder.sigExternal(channel: string, type) update
- SignalEvaluator simplification (single line snapshot read)
- executeFrame calls external.commit() at frame start

## Work Items

### P0: ExternalWriteBus class

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 2.2
**Status Reference:** EVALUATION-20260125.md - "What's Missing (Per Spec)"

**Acceptance Criteria:**
- [ ] ExternalWriteBus class implemented in src/runtime/ExternalChannel.ts
- [ ] set(name: string, v: number) method for 'value' channels
- [ ] pulse(name: string) method for 'pulse' channels
- [ ] add(name: string, dv: number) method for 'accum' channels
- [ ] Internal queue stores WriteRecord[] of type { op: 'set'|'pulse'|'add', name: string, v?: number }
- [ ] drain() returns and clears the queue

**Technical Notes:**
- Simple queue-based design is sufficient for single-threaded JS
- No thread safety needed yet, but structure allows future ring buffer swap
- Follow spec WriteRecord type exactly

---

### P1: ExternalChannelSnapshot class

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 4.1
**Status Reference:** EVALUATION-20260125.md - "What's Missing (Per Spec)"

**Acceptance Criteria:**
- [ ] ExternalChannelSnapshot class is immutable (frozen or readonly)
- [ ] getFloat(name: string): number returns 0 if channel absent
- [ ] getVec2(name: string): { x: number; y: number } returns {0,0} if absent
- [ ] Internal storage uses Map<string, number> (Phase 1 per spec)
- [ ] Optional Map<string, {x,y}> for vec2 channels

**Technical Notes:**
- Start with Map<string, number> for Phase 1 simplicity
- Vec2 can be stored as two channels (e.g., mouse.x, mouse.y) or dedicated map
- Recommend: use scalar channels only initially, vec2 via naming convention

---

### P2: ExternalChannelSystem class

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 2.1
**Status Reference:** EVALUATION-20260125.md - "What's Missing (Per Spec)"

**Acceptance Criteria:**
- [ ] ExternalChannelSystem class owns writeBus, staging, and committed snapshot
- [ ] Exposes writeBus for external writers (UI/audio threads)
- [ ] Exposes snapshot getter for runtime reads
- [ ] commit() method performs the full commit algorithm
- [ ] Staging is a mutable Map<string, number> for accumulation

**Technical Notes:**
- This is the single owner of external channel state
- writeBus is the write-side API
- snapshot is the read-side API
- commit() is called exactly once per frame at frame start

---

### P3: Commit lifecycle

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 3
**Status Reference:** EVALUATION-20260125.md - "What's Missing (Per Spec)"

**Acceptance Criteria:**
- [ ] commit() drains write bus to get WriteRecord[]
- [ ] Folding rules applied per channel kind:
  - value: last write wins (S[name] = v)
  - pulse: S[name] = 1 for any pulse
  - accum: S[name] += dv
- [ ] Staging swapped into committed snapshot (reference swap)
- [ ] Pulse channels reset to 0 after commit
- [ ] Accum channels reset to 0 after commit
- [ ] Value channels persist until next write

**Technical Notes:**
- Channel kind determined by name prefix or registry lookup
- For now, use naming convention: mouse.button.*.down = pulse, mouse.wheel.* = accum
- Can add ChannelDefResolver later for Phase 2

---

### P4: IR changes - SigExprExternal.which to string

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 4.2
**Status Reference:** EVALUATION-20260125.md - "hardcoded switch statement for 3 mouse values"

**Acceptance Criteria:**
- [ ] SigExprExternal interface updated: which: string (not literal union)
- [ ] No breaking changes to existing IR consumers (string is superset)
- [ ] TypeScript compiles without errors
- [ ] Existing tests pass

**Technical Notes:**
- Change in src/compiler/ir/types.ts line 113-117
- From: `which: 'mouseX' | 'mouseY' | 'mouseOver'`
- To: `which: string`
- This is a type-level change only, no runtime impact

---

### P5: IRBuilder.sigExternal update

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 5
**Status Reference:** EVALUATION-20260125.md - "IRBuilder.sigExternal(): only accepts the 3 hardcoded mouse names"

**Acceptance Criteria:**
- [ ] IRBuilder interface updated: sigExternal(channel: string, type: CanonicalType)
- [ ] IRBuilderImpl updated to accept any string channel name
- [ ] Existing sigExternal calls continue to work (backward compatible)
- [ ] TypeScript compiles without errors

**Technical Notes:**
- Change in src/compiler/ir/IRBuilder.ts line 48
- Change in src/compiler/ir/IRBuilderImpl.ts line 125
- From: `sigExternal(which: 'mouseX' | 'mouseY' | 'mouseOver', type: CanonicalType)`
- To: `sigExternal(channel: string, type: CanonicalType)`

---

### P6: SignalEvaluator simplification

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 4.2
**Status Reference:** EVALUATION-20260125.md - "hardcoded switch statement for 3 mouse values"

**Acceptance Criteria:**
- [ ] SignalEvaluator 'external' case simplified to single line
- [ ] Reads from state.external.snapshot.getFloat(expr.which)
- [ ] No device-specific switch statements remain
- [ ] All existing tests pass

**Technical Notes:**
- Current code (lines 175-181) has hardcoded switch for mouseX/mouseY/mouseOver
- Replace entire switch with: `return state.external.snapshot.getFloat(expr.which)`
- This requires state.external to be ExternalChannelSystem (not ExternalInputs)

---

### P7: executeFrame calls external.commit()

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 3.1
**Status Reference:** EVALUATION-20260125.md - "Commit lifecycle in executeFrame"

**Acceptance Criteria:**
- [ ] executeFrame in ScheduleExecutor.ts calls state.external.commit() at frame start
- [ ] Commit happens before any signal evaluation
- [ ] Commit happens exactly once per frame
- [ ] Frame timing metrics unaffected (commit is O(1) amortized)

**Technical Notes:**
- Add commit() call at top of executeFrame function
- This ensures snapshot is immutable for entire frame
- All writers see previous frame's snapshot until next commit

---

## Dependencies

- P1 requires P0 (snapshot uses write bus drain output)
- P2 requires P0 and P1 (system owns both)
- P3 requires P2 (commit is method on system)
- P6 requires P2 (evaluator needs snapshot API)
- P7 requires P2 (executeFrame needs commit method)
- P4 and P5 are independent (can be done in parallel)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| RuntimeState interface change breaks tests | Medium | Low | Update tests incrementally as external changes |
| Performance regression from Map lookup | Low | Low | Benchmark; Map.get is O(1) |
| Backward compatibility with existing mouse code | Medium | Medium | Keep ExternalInputs temporarily, migrate in Sprint 3 |
