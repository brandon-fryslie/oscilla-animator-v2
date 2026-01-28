# Time-Model Evaluation

**Generated:** 2026-01-12
**Topic:** time-model
**Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md`

---

## Current Implementation Status

### What Exists

| Component | Location | Status |
|-----------|----------|--------|
| TimeRoot Blocks | `src/blocks/time-blocks.ts` | Generates tMs, phaseA, phaseB, dt |
| Pass 3: Time Model | `src/compiler/passes-v2/pass3-time.ts` | Extracts TimeModel, generates TimeSignals |
| Time Resolution | `src/runtime/timeResolution.ts` | Phase wrapping, continuity tracking |
| Signal Evaluator | `src/runtime/SignalEvaluator.ts` | Evaluates time signals |

### TimeRoot Outputs - Spec Compliance

| Output | Spec Type | Implemented | Status |
|--------|-----------|-------------|--------|
| `tMs` | int, continuous | Yes | Complete |
| `dt` | float, continuous | Yes | Complete |
| `phaseA` | phase, continuous | Yes | Wrong type (float) |
| `phaseB` | phase, continuous | Yes | Wrong type (float) |
| `progress` | unit, continuous | Yes | Complete |
| `pulse` | unit, discrete | Partial | Wrong model (continuous) |
| `palette` | color, continuous | No | **MISSING** |
| `energy` | float, continuous | No | **MISSING** |

---

## Critical Gaps

### 1. Missing Outputs: Palette and Energy
- Spec requires 8 outputs, we have 6
- `palette`: HSV rainbow (hue=phaseA, sat=1.0, val=0.5)
- `energy`: Sine wave (0.5 + 0.5*sin(phaseA*2*PI))

### 2. Independent Period Configuration
- Spec: phaseA and phaseB have independent periods (periodAMs, periodBMs)
- Current: Single `periodMs` parameter
- TimeModel IR supports this but blocks don't expose it

### 3. Phase Type Mismatch
- Blocks use `canonicalType('float')` for phases
- Spec defines `PayloadType = 'phase'` as distinct type
- No phase-specific wrap semantics enforcement

### 4. Pulse Signal Model
- Implemented as continuous 0/1 value
- Spec: discrete event (one + discrete + unit)
- This is a semantic difference

### 5. Rails Not Implemented
- Spec: Rails are system-provided pass-through blocks
- Current: No rail infrastructure
- Rails: time, phaseA, phaseB, pulse, palette

---

## Working Code

- Time resolution loop compiles and executes
- Phase wrapping and continuity tracking works
- State preservation across frames
- Offset tracking exists (offsetA, offsetB) for hot-swap

---

## Ambiguities Requiring Resolution

1. **Palette computation**: Hardcoded HSV or user-configurable?
   - **Resolution**: Hardcoded for MVP (spec says "default color atmosphere")

2. **Energy audio reactivity**: Should energy have an audio input?
   - **Resolution**: Defer audio input to Phase 3. MVP is sine wave from phaseA.

3. **Pulse event model**: IR supports discrete events?
   - **Resolution**: Keep as continuous for MVP. Discrete events are Phase 3.

4. **Rail creation**: Who creates rails, when?
   - **Resolution**: Defer rails to buses-and-rails topic. TimeRoot just outputs signals.

---

## Verdict: CONTINUE

The time-model work is well-scoped:
- Add palette and energy outputs (straightforward)
- Add independent period params (straightforward)
- Phase type and rails are separate topics

No blocking ambiguities for core TimeRoot completion.
