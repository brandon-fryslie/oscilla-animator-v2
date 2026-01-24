# Sprint: stateful-primitives - Lag & Phasor MVP Blocks
Generated: 2026-01-26T00:00:00Z
Confidence: HIGH: 2, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260125-234400.md

## Sprint Goal
Complete the 4 MVP stateful primitives by implementing Lag (exponential smoothing) and Phasor (phase accumulator with wrap), following established UnitDelay/SampleHold patterns.

## Scope
**Deliverables:**
- Lag block: exponential smoothing toward target value, per-lane state
- Phasor block: 0..1 phase accumulator with wrap semantics, per-lane state
- Tests for both blocks (compilation, runtime behavior, state persistence)
- Both blocks recognized as stateful by SCC cycle validation

## Work Items

### [P0] U-4: Lag Block - Exponential Smoothing

**Dependencies**: None (UnitDelay pattern established)
**Spec Reference**: 02-block-system.md L204 (MVP stateful primitives), L226-228 (Note on Lag), RESOLUTION-LOG D1/D2
**Status Reference**: EVALUATION-20260125-234400.md "Stateful Primitives (U-4, U-5)" section

#### Description
Implement the Lag block as a stateful primitive that smooths toward a target value using exponential smoothing. Formula: `y(t) = lerp(y(t-1), target, smoothing)` where `smoothing` is a 0..1 coefficient controlling convergence speed.

Per spec, Lag is "technically a composite (could be built from UnitDelay + arithmetic), but it's labeled as a primitive for practical purposes" (D2 resolution). It is classified as a stateful primitive alongside UnitDelay, Phasor, and SampleAndHold.

The block is:
- Category: `signal` (alongside UnitDelay)
- Capability: `state`
- Cardinality-generic: yes (per-lane, laneLocal)
- Payload-generic: yes (over `{float, vec2, vec3, color}`) -- however, for MVP, implement float-only. Payload-generic support can be added later following the Const block pattern.

For MVP, implement float-only Lag. The payload-generic expansion is tracked separately.

#### Inputs
- `target` (float): The value to smooth toward
- `smoothing` (float, config, default 0.1): Smoothing coefficient in [0, 1]. 0 = no movement, 1 = instant snap.
- `initialValue` (float, config, default 0): Initial state value

#### Outputs
- `out` (float): Smoothed output value

#### Semantics
```
state[0] initialized to initialValue
Each frame:
  prev = stateRead(stateSlot)      // Phase 1: read previous value
  out = lerp(prev, target, smoothing)  // Compute smoothed value
  stateWrite(stateSlot, out)        // Phase 2: write for next frame
  output = out
```

#### Acceptance Criteria
- [ ] Block registered as type `'Lag'` with `capability: 'state'` and `isStateful: true`
- [ ] Block has inputs: `target` (signal), `smoothing` (config, default 0.1), `initialValue` (config, default 0)
- [ ] Block has output: `out` (float signal)
- [ ] Lowering uses `allocStateSlot`, `sigStateRead`, `stepStateWrite` with `stableStateId(instanceId, 'lag')`
- [ ] Runtime: first frame outputs `initialValue` lerped toward target by smoothing factor
- [ ] Runtime: subsequent frames converge toward target value exponentially
- [ ] SCC pass recognizes Lag as a valid cycle-breaking boundary (`isStateful: true`)
- [ ] Tests: compilation succeeds, state slot allocated, multi-frame convergence verified

#### Technical Notes
- Follow UnitDelay pattern exactly for state management (allocStateSlot, sigStateRead, stepStateWrite)
- The smoothing coefficient is a config/param, not a wirable input (keep it simple for MVP)
- Use `OpCode.Lerp` for the smoothing computation: `lerp(prev, target, smoothing)`
- CRITICAL: Must set `isStateful: true` in the BlockDef for SCC cycle validation to work
- The block goes in `src/blocks/signal-blocks.ts` alongside UnitDelay

---

### [P0] U-5: Phasor Block - Phase Accumulator with Wrap

**Dependencies**: None (UnitDelay pattern established, Wrap01 opcode exists)
**Spec Reference**: 02-block-system.md L205 (MVP stateful primitives), RESOLUTION-LOG D1/D3
**Status Reference**: EVALUATION-20260125-234400.md "Stateful Primitives (U-4, U-5)" section

#### Description
Implement the Phasor block as a stateful primitive that accumulates phase from 0 to 1, wrapping at 1.0. This is distinct from Accumulator (post-MVP, unbounded) per RESOLUTION-LOG D3.

Formula: `y(t) = wrap01(y(t-1) + frequency * dt)` where:
- `frequency` is cycles per second (Hz)
- `dt` is the frame delta time in seconds
- `wrap01` maps to [0, 1) range

The Phasor block is the standard way to generate ramp/sawtooth-like signals and phase inputs for oscillators. It produces a `phase01` unit output.

The block is:
- Category: `signal` (alongside UnitDelay)
- Capability: `state`
- Cardinality-generic: yes (per-lane, laneLocal)
- NOT payload-generic (always produces float with unit phase01)

#### Inputs
- `frequency` (float, signal): Frequency in Hz (cycles per second). Can be wired or config.
- `initialPhase` (float, config, default 0): Initial phase value in [0, 1)

#### Outputs
- `out` (float, unit: phase01): Current phase value in [0, 1)

#### Semantics
```
state[0] initialized to initialPhase
Each frame:
  prev = stateRead(stateSlot)         // Phase 1: read previous phase
  dtSec = dt / 1000.0                 // Convert dt from ms to seconds
  increment = frequency * dtSec       // Phase increment this frame
  newPhase = wrap01(prev + increment) // Accumulate and wrap
  stateWrite(stateSlot, newPhase)     // Phase 2: write for next frame
  output = newPhase
```

Note: The output is the NEW phase (post-increment), not the previous phase. This differs from UnitDelay which outputs the PREVIOUS value.

#### Acceptance Criteria
- [ ] Block registered as type `'Phasor'` with `capability: 'state'` and `isStateful: true`
- [ ] Block has inputs: `frequency` (float signal, wirable), `initialPhase` (config, default 0)
- [ ] Block has output: `out` with type `signalType('float', unitPhase01())`
- [ ] Lowering uses `allocStateSlot`, `sigStateRead`, `stepStateWrite` with `stableStateId(instanceId, 'phasor')`
- [ ] Phase wraps correctly at 1.0 (uses OpCode.Wrap01 or equivalent fract operation)
- [ ] Frequency input correctly converts dt from ms to seconds before multiplication
- [ ] Runtime: at 1 Hz with 16.667ms dt, phase increments by ~0.01667 per frame
- [ ] Runtime: phase wraps from near-1.0 back to near-0.0 correctly
- [ ] SCC pass recognizes Phasor as a valid cycle-breaking boundary (`isStateful: true`)
- [ ] Tests: compilation succeeds, state slot allocated, phase accumulation and wrap verified

#### Technical Notes
- The Phasor needs access to `dt` (delta time). This comes as a wired input from TimeRoot's `dt` output, OR can be accessed via a wired connection. For MVP, accept `dt` as a signal input port (users wire TimeRoot.dt -> Phasor.dt).
- ALTERNATIVE: Use `frequency` input only, and internally the lower function gets dt via `ctx.b.sigTime('dt', ...)`. This is cleaner since it avoids requiring users to manually wire dt. Check how TimeRoot exposes dt -- it uses `sigTime('dt', signalType('float'))`. The Phasor can do the same to reference the time system's dt.
- Use `OpCode.Wrap01` for the wrap operation (confirmed existing in codebase)
- Use `OpCode.Mul` for frequency * dtSec, `OpCode.Add` for prev + increment
- Division by 1000 for ms->sec: use `OpCode.Div` with a const 1000, or `OpCode.Mul` with const 0.001
- CRITICAL: Must set `isStateful: true` in the BlockDef for SCC cycle validation
- The block goes in `src/blocks/signal-blocks.ts` alongside UnitDelay

---

## Dependencies
- No external dependencies. Both blocks follow established patterns.
- Internal dependency: Phasor depends on dt being available from the time system (already implemented via `sigTime('dt', ...)`).

## Risks
- **LOW**: The `isStateful` field is not currently set on UnitDelay or SampleHold. The new blocks MUST set it. Verify the SCC pass test coverage to ensure no regression.
- **LOW**: Phasor's dt access via `sigTime` needs verification that it works outside TimeRoot blocks. If not, fall back to explicit dt input port.
- **NONE**: Both Lag and Phasor use the exact same state management API as UnitDelay (allocStateSlot, sigStateRead, stepStateWrite). The pattern is proven.
