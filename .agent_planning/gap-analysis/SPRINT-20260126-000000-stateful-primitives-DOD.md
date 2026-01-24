# Definition of Done: stateful-primitives
Generated: 2026-01-26T00:00:00Z
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260126-000000-stateful-primitives-PLAN.md
Source: EVALUATION-20260125-234400.md

## Acceptance Criteria

### U-4: Lag Block

- [ ] `src/blocks/signal-blocks.ts` contains a `registerBlock` call for type `'Lag'`
- [ ] BlockDef has `capability: 'state'` AND `isStateful: true`
- [ ] BlockDef has `category: 'signal'`, `form: 'primitive'`
- [ ] BlockDef has cardinality metadata: `cardinalityMode: 'preserve'`, `laneCoupling: 'laneLocal'`
- [ ] Input ports: `target` (float signal, wirable), `smoothing` (float config, default 0.1), `initialValue` (float config, default 0)
- [ ] Output port: `out` (float signal)
- [ ] Lower function calls `allocStateSlot(stableStateId(ctx.instanceId, 'lag'), { initialValue })`
- [ ] Lower function calls `sigStateRead(stateSlot, signalType('float'))` to get previous value
- [ ] Lower function uses `OpCode.Lerp` to compute `lerp(prev, target, smoothing)`
- [ ] Lower function calls `stepStateWrite(stateSlot, outputId)` to persist new value
- [ ] Test: compilation produces 1 state slot with correct initialValue
- [ ] Test: frame 1 output = lerp(initialValue, target, smoothing)
- [ ] Test: multi-frame execution converges toward target
- [ ] Test: smoothing=0 produces no movement (output stays at initialValue)
- [ ] Test: smoothing=1 produces instant snap (output = target immediately)
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all existing + new tests)

### U-5: Phasor Block

- [ ] `src/blocks/signal-blocks.ts` contains a `registerBlock` call for type `'Phasor'`
- [ ] BlockDef has `capability: 'state'` AND `isStateful: true`
- [ ] BlockDef has `category: 'signal'`, `form: 'primitive'`
- [ ] BlockDef has cardinality metadata: `cardinalityMode: 'preserve'`, `laneCoupling: 'laneLocal'`
- [ ] Input ports: `frequency` (float signal, wirable), `initialPhase` (float config, default 0)
- [ ] Output port: `out` with type `signalType('float', unitPhase01())`
- [ ] Lower function calls `allocStateSlot(stableStateId(ctx.instanceId, 'phasor'), { initialValue: initialPhase })`
- [ ] Lower function calls `sigStateRead(stateSlot, signalType('float'))` to get previous phase
- [ ] Lower function accesses dt (either via `sigTime('dt', ...)` or input port)
- [ ] Lower function converts dt from ms to seconds (multiply by 0.001)
- [ ] Lower function computes increment = frequency * dtSec
- [ ] Lower function computes newPhase = wrap01(prev + increment) using `OpCode.Wrap01`
- [ ] Lower function calls `stepStateWrite(stateSlot, newPhase)` to persist
- [ ] Test: compilation produces 1 state slot with correct initialPhase
- [ ] Test: with frequency=1Hz and dt=1000ms, phase advances by 1.0 (wraps to 0.0)
- [ ] Test: with frequency=1Hz and dt=500ms, phase advances by 0.5
- [ ] Test: phase wraps correctly from 0.9 + 0.2 increment = 0.1 (not 1.1)
- [ ] Test: frequency=0 produces no phase advancement
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all existing + new tests)

### Integration: SCC Cycle Validation

- [ ] Both Lag and Phasor blocks have `isStateful: true` set in their BlockDef
- [ ] A graph with a cycle through Lag compiles successfully (SCC accepts it)
- [ ] A graph with a cycle through Phasor compiles successfully (SCC accepts it)

### Overall Sprint

- [ ] No regressions: all 1284+ existing tests still pass
- [ ] `npm run typecheck` clean (no errors)
- [ ] Both blocks are importable and discoverable via `getBlockDefinition('Lag')` and `getBlockDefinition('Phasor')`
