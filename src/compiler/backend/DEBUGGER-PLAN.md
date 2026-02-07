╭───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Plan to implement                                                                                                     │
│                                                                                                                       │
│ Step-Through Schedule Debugger — Implementation Plan                                                                  │
│                                                                                                                       │
│ Context                                                                                                               │
│                                                                                                                       │
│ Debugging the Oscilla runtime currently requires browser DevTools breakpoints or inspecting the DebugTap sparkline    │
│ values after the fact. Neither approach gives visibility into which schedule step produced a value, what the          │
│ expression tree looks like at a pause point, or which step first introduced a NaN. This plan adds a generator-based   │
│ step-through debugger that pauses between ScheduleIR steps and exposes full slot/expression inspection — without      │
│ modifying the production executeFrame() code path.                                                                    │
│                                                                                                                       │
│ ---                                                                                                                   │
│ New Files (7)                                                                                                         │
│                                                                                                                       │
│ 1. src/runtime/SlotLookupCache.ts — Shared slot lookup utilities                                                      │
│                                                                                                                       │
│ Extract the three WeakMap-cached functions from ScheduleExecutor.ts (lines 42–107) into a shared module so both       │
│ executeFrame and the stepped variant use the same caches.                                                             │
│                                                                                                                       │
│ Extract:                                                                                                              │
│ - getSlotLookupMap(program) → Map<ValueSlot, SlotLookup>                                                              │
│ - getFieldExprToSlotMap(program) → Map<number, ValueSlot>                                                             │
│ - getSigToSlotMap(program, slotLookupMap) → Map<number, number>                                                       │
│ - SlotLookup type: { storage, offset, stride, slot }                                                                  │
│ - The three WeakMap caches move here                                                                                  │
│ - assertSlotExists() and assertF64Stride() helpers move here                                                          │
│                                                                                                                       │
│ After extraction, update ScheduleExecutor.ts to import from SlotLookupCache.ts. This is the only change to existing   │
│ production code.                                                                                                      │
│                                                                                                                       │
│ 2. src/runtime/StepDebugTypes.ts — Type definitions                                                                   │
│                                                                                                                       │
│ Pure types, no logic:                                                                                                 │
│                                                                                                                       │
│ type ExecutionPhase = 'pre-frame' | 'phase1' | 'phase-boundary' | 'phase2' | 'post-frame';                            │
│                                                                                                                       │
│ interface StepSnapshot {                                                                                              │
│   stepIndex: number;          // -1 for phase markers                                                                 │
│   step: Step | null;          // null for phase markers                                                               │
│   phase: ExecutionPhase;                                                                                              │
│   totalSteps: number;                                                                                                 │
│   blockId: BlockId | null;    // from debugIndex.stepToBlock                                                          │
│   blockName: string | null;   // from debugIndex.blockMap                                                             │
│   portId: PortId | null;      // from debugIndex.stepToPort                                                           │
│   frameId: number;                                                                                                    │
│   tMs: number;                                                                                                        │
│   writtenSlots: ReadonlyMap<ValueSlot, SlotValue>;                                                                    │
│   anomalies: readonly ValueAnomaly[];                                                                                 │
│ }                                                                                                                     │
│                                                                                                                       │
│ type SlotValue =                                                                                                      │
│   | { kind: 'scalar'; value: number; type: CanonicalType }                                                            │
│   | { kind: 'buffer'; buffer: ArrayBufferView; count: number; type: CanonicalType }                                   │
│   | { kind: 'event'; fired: boolean }                                                                                 │
│   | { kind: 'object'; ref: unknown };                                                                                 │
│                                                                                                                       │
│ interface ValueAnomaly {                                                                                              │
│   slot: ValueSlot;                                                                                                    │
│   kind: 'nan' | 'infinity' | 'neg-infinity';                                                                          │
│   blockId: BlockId | null;                                                                                            │
│   portId: PortId | null;                                                                                              │
│ }                                                                                                                     │
│                                                                                                                       │
│ type Breakpoint =                                                                                                     │
│   | { kind: 'step-index'; index: number }                                                                             │
│   | { kind: 'block-id'; blockId: BlockId }                                                                            │
│   | { kind: 'phase-boundary' }                                                                                        │
│   | { kind: 'anomaly' };        // NaN/Infinity detection                                                             │
│                                                                                                                       │
│ type SessionMode = 'idle' | 'paused' | 'running' | 'completed';                                                       │
│                                                                                                                       │
│ 3. src/runtime/ValueExprTreeWalker.ts — Expression tree traversal                                                     │
│                                                                                                                       │
│ Two functions:                                                                                                        │
│                                                                                                                       │
│ - getValueExprChildren(expr: ValueExpr): readonly ValueExprId[] — Exhaustive switch over all 12 kinds + kernel        │
│ sub-kinds. Uses never exhaustiveness check so adding a new kind is a compile error.                                   │
│ - walkValueExprTree(rootId, nodes, visitor) — Depth-first walk with cycle detection (visited set) and early return if │
│  visitor returns false.                                                                                               │
│                                                                                                                       │
│ Reference: src/compiler/ir/value-expr.ts defines all child reference fields. The child map per kind:                  │
│ ┌────────────────────────────────────────────────────┬────────────────────────────────────┐                           │
│ │                        Kind                        │              Children              │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ const, external, intrinsic, time, state, eventRead │ [] (leaf)                          │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ extract, hslToRgb                                  │ [input]                            │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ construct                                          │ [...components]                    │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ kernel(map)                                        │ [input]                            │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ kernel(zip)                                        │ [...inputs]                        │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ kernel(zipSig)                                     │ [field, ...signals]                │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ kernel(broadcast)                                  │ [signal, ...?signalComponents]     │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ kernel(reduce), kernel(pathDerivative)             │ [field]                            │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ shapeRef                                           │ [...paramArgs, ?controlPointField] │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ event(wrap)                                        │ [input]                            │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ event(combine)                                     │ [...inputs]                        │                           │
│ ├────────────────────────────────────────────────────┼────────────────────────────────────┤                           │
│ │ event(pulse/never/const)                           │ []                                 │                           │
│ └────────────────────────────────────────────────────┴────────────────────────────────────┘                           │
│ 4. src/runtime/ValueInspector.ts — Slot reading utilities                                                             │
│                                                                                                                       │
│ Read-only functions for inspecting runtime state:                                                                     │
│                                                                                                                       │
│ - readSlotValue(state, lookup, slotMeta) → SlotValue — Dispatch on lookup.storage to read from f64, objects, or       │
│ shape2d                                                                                                               │
│ - detectAnomalies(writtenSlots, debugIndex) → ValueAnomaly[] — Check each scalar SlotValue for isNaN / !isFinite      │
│ - inspectBlockSlots(blockId, program, state, slotLookupMap) → Map<ValueSlot, SlotValue> — Find all slots for a block  │
│ via debugIndex.slotToBlock, read each                                                                                 │
│                                                                                                                       │
│ 5. src/runtime/executeFrameStepped.ts — Generator executor                                                            │
│                                                                                                                       │
│ function* executeFrameStepped(                                                                                        │
│   program: CompiledProgramIR,                                                                                         │
│   state: RuntimeState,                                                                                                │
│   arena: RenderBufferArena,                                                                                           │
│   tAbsMs: number,                                                                                                     │
│ ): Generator<StepSnapshot, RenderFrameIR, void>                                                                       │
│                                                                                                                       │
│ Mirrors executeFrame() structure (lines 163–671 of ScheduleExecutor.ts) using the same imported helpers               │
│ (evaluateValueExprSignal, materializeValueExpr, evaluateValueExprEvent, resolveTime, assembleRenderFrame, etc.).      │
│                                                                                                                       │
│ Yield points:                                                                                                         │
│ 1. After pre-frame setup (time resolve, cache advance, event clear) → phase: 'pre-frame'                              │
│ 2. After each Phase 1 step executes → phase: 'phase1', with writtenSlots and anomalies populated                      │
│ 3. After render assembly completes → phase: 'phase-boundary'                                                          │
│ 4. After each Phase 2 step executes → phase: 'phase2'                                                                 │
│ 5. After continuity finalization → phase: 'post-frame'                                                                │
│                                                                                                                       │
│ Slot capture after each step:                                                                                         │
│ - evalValue → read state.values.f64[offset] or eventScalars[slot] depending on strategy                               │
│ - slotWriteStrided → read N contiguous f64 values                                                                     │
│ - materialize → read state.values.objects.get(target)                                                                 │
│ - stateWrite → read state.state[stateSlot]                                                                            │
│ - fieldStateWrite → read state.state[baseSlot..baseSlot+count]                                                        │
│ - render → no slot writes (just collect)                                                                              │
│ - continuityMapBuild/Apply → read continuity mapping metadata                                                         │
│                                                                                                                       │
│ Block provenance: Use program.debugIndex.stepToBlock and program.debugIndex.blockMap to label each snapshot.          │
│                                                                                                                       │
│ 6. src/runtime/StepDebugSession.ts — Session controller                                                               │
│                                                                                                                       │
│ class StepDebugSession {                                                                                              │
│   constructor(program, state, arena)                                                                                  │
│                                                                                                                       │
│   // State                                                                                                            │
│   get mode(): SessionMode                                                                                             │
│   get currentSnapshot(): StepSnapshot | null                                                                          │
│   get frameResult(): RenderFrameIR | null                                                                             │
│   get stepHistory(): readonly StepSnapshot[]                                                                          │
│                                                                                                                       │
│   // Breakpoints                                                                                                      │
│   addBreakpoint(bp: Breakpoint): void                                                                                 │
│   removeBreakpoint(bp: Breakpoint): void                                                                              │
│   clearBreakpoints(): void                                                                                            │
│                                                                                                                       │
│   // Execution control                                                                                                │
│   startFrame(tAbsMs: number): StepSnapshot                                                                            │
│   stepNext(): StepSnapshot | null                                                                                     │
│   runToBreakpoint(): StepSnapshot | null                                                                              │
│   runToPhaseEnd(): StepSnapshot | null                                                                                │
│   finishFrame(): RenderFrameIR                                                                                        │
│   dispose(): void                                                                                                     │
│ }                                                                                                                     │
│                                                                                                                       │
│ Breakpoint matching in matchesBreakpoint(snapshot):                                                                   │
│ - step-index: snapshot.stepIndex === bp.index                                                                         │
│ - block-id: snapshot.blockId === bp.blockId                                                                           │
│ - phase-boundary: snapshot.phase === 'phase-boundary'                                                                 │
│ - anomaly: snapshot.anomalies.length > 0                                                                              │
│                                                                                                                       │
│ Invariant: Once startFrame() is called, the frame must be completed (via finishFrame() or dispose()) before the next  │
│ frame can start. Abandoning a generator mid-frame would leave RuntimeState with incomplete Phase 2 writes.            │
│                                                                                                                       │
│ 7. src/stores/StepDebugStore.ts — MobX store                                                                          │
│                                                                                                                       │
│ class StepDebugStore {                                                                                                │
│   active: boolean = false;                                                                                            │
│   mode: SessionMode = 'idle';                                                                                         │
│   currentSnapshot: StepSnapshot | null = null;                                                                        │
│   history: StepSnapshot[] = [];                                                                                       │
│   breakpoints: Breakpoint[] = [];                                                                                     │
│   selectedSlot: ValueSlot | null = null;                                                                              │
│   selectedExprId: ValueExprId | null = null;                                                                          │
│                                                                                                                       │
│   activate(): void                                                                                                    │
│   deactivate(): void                                                                                                  │
│   startFrame(program, state, arena, tMs): void                                                                        │
│   stepNext(): void                                                                                                    │
│   runToBreakpoint(): void                                                                                             │
│   runToPhaseEnd(): void                                                                                               │
│   finishFrame(): void                                                                                                 │
│   inspectSlot(slot): SlotValue | undefined                                                                            │
│   addBreakpoint(bp): void                                                                                             │
│   removeBreakpoint(index: number): void                                                                               │
│   toggleAnomalyBreakpoint(): void                                                                                     │
│   dispose(): void                                                                                                     │
│ }                                                                                                                     │
│                                                                                                                       │
│ ---                                                                                                                   │
│ Modified Files (3)                                                                                                    │
│                                                                                                                       │
│ 1. src/runtime/ScheduleExecutor.ts                                                                                    │
│                                                                                                                       │
│ Change: Replace inline slot lookup functions/caches with imports from SlotLookupCache.ts. The body of executeFrame()  │
│ is untouched — only the import source for getSlotLookupMap, getFieldExprToSlotMap, getSigToSlotMap, SlotLookup,       │
│ assertSlotExists, assertF64Stride changes.                                                                            │
│                                                                                                                       │
│ 2. src/services/AnimationLoop.ts                                                                                      │
│                                                                                                                       │
│ Change: Add conditional branch in startAnimationLoop or executeAnimationFrame:                                        │
│                                                                                                                       │
│ // In the animate() function:                                                                                         │
│ if (stepDebugStore?.active) {                                                                                         │
│   executeAnimationFrameDebug(tMs, deps, state, stepDebugStore);                                                       │
│ } else {                                                                                                              │
│   executeAnimationFrame(tMs, deps, state);                                                                            │
│ }                                                                                                                     │
│                                                                                                                       │
│ Where executeAnimationFrameDebug:                                                                                     │
│ - If no frame in progress and mode is idle or completed: calls store.startFrame() to begin next frame, then renders   │
│ last completed frame                                                                                                  │
│ - If mode is paused: renders last completed frame (user is stepping via UI)                                           │
│ - If mode is completed: renders the frame result                                                                      │
│                                                                                                                       │
│ The animation loop keeps running at rAF rate for rendering, but execution only advances when the user steps.          │
│                                                                                                                       │
│ 3. src/stores/RootStore.ts                                                                                            │
│                                                                                                                       │
│ Change: Add readonly stepDebug: StepDebugStore field. Create in constructor. Wire dispose.                            │
│                                                                                                                       │
│ ---                                                                                                                   │
│ Export Updates                                                                                                        │
│                                                                                                                       │
│ src/runtime/index.ts                                                                                                  │
│                                                                                                                       │
│ export { executeFrameStepped } from './executeFrameStepped';                                                          │
│ export { StepDebugSession } from './StepDebugSession';                                                                │
│ export { getValueExprChildren, walkValueExprTree } from './ValueExprTreeWalker';                                      │
│ export { readSlotValue, detectAnomalies, inspectBlockSlots } from './ValueInspector';                                 │
│ export { getSlotLookupMap, getFieldExprToSlotMap, getSigToSlotMap } from './SlotLookupCache';                         │
│ export type * from './StepDebugTypes';                                                                                │
│                                                                                                                       │
│ src/stores/index.ts                                                                                                   │
│                                                                                                                       │
│ export { StepDebugStore } from './StepDebugStore';                                                                    │
│                                                                                                                       │
│ ---                                                                                                                   │
│ Implementation Order                                                                                                  │
│ Phase: A1                                                                                                             │
│ Files: SlotLookupCache.ts + update ScheduleExecutor.ts imports                                                        │
│ Tests: All existing runtime tests must pass                                                                           │
│ Depends On: —                                                                                                         │
│ ────────────────────────────────────────                                                                              │
│ Phase: A2                                                                                                             │
│ Files: StepDebugTypes.ts                                                                                              │
│ Tests: Type-only, no tests                                                                                            │
│ Depends On: —                                                                                                         │
│ ────────────────────────────────────────                                                                              │
│ Phase: A3                                                                                                             │
│ Files: ValueExprTreeWalker.ts                                                                                         │
│ Tests: __tests__/ValueExprTreeWalker.test.ts — one test per ValueExpr kind                                            │
│ Depends On: A2                                                                                                        │
│ ────────────────────────────────────────                                                                              │
│ Phase: A4                                                                                                             │
│ Files: ValueInspector.ts                                                                                              │
│ Tests: __tests__/ValueInspector.test.ts — read scalar/strided/object/event, anomaly detection                         │
│ Depends On: A1, A2                                                                                                    │
│ ────────────────────────────────────────                                                                              │
│ Phase: B1                                                                                                             │
│ Files: executeFrameStepped.ts                                                                                         │
│ Tests: __tests__/executeFrameStepped.test.ts — compile simple patch, iterate generator, verify snapshots match        │
│   executeFrame output                                                                                                 │
│ Depends On: A1, A2, A4                                                                                                │
│ ────────────────────────────────────────                                                                              │
│ Phase: B2                                                                                                             │
│ Files: StepDebugSession.ts                                                                                            │
│ Tests: __tests__/StepDebugSession.test.ts — breakpoint matching, lifecycle                                            │
│ Depends On: B1                                                                                                        │
│ ────────────────────────────────────────                                                                              │
│ Phase: C1                                                                                                             │
│ Files: StepDebugStore.ts + RootStore.ts update                                                                        │
│ Tests: Mock session tests                                                                                             │
│ Depends On: B2                                                                                                        │
│ ────────────────────────────────────────                                                                              │
│ Phase: C2                                                                                                             │
│ Files: AnimationLoop.ts integration                                                                                   │
│ Tests: Manual integration test                                                                                        │
│ Depends On: C1                                                                                                        │
│ ---                                                                                                                   │
│ Test Strategy                                                                                                         │
│                                                                                                                       │
│ All core modules (A1–B2) are testable without UI.                                                                     │
│                                                                                                                       │
│ A3 — ValueExprTreeWalker:                                                                                             │
│ - Construct each of the 12 ValueExpr kinds manually                                                                   │
│ - Verify getValueExprChildren() returns correct child IDs                                                             │
│ - walkValueExprTree(): build a small DAG, verify visit order and cycle safety                                         │
│                                                                                                                       │
│ A4 — ValueInspector:                                                                                                  │
│ - Create synthetic RuntimeState with known f64 values                                                                 │
│ - Verify readSlotValue() returns correct typed values                                                                 │
│ - Insert NaN/Infinity, verify detectAnomalies() catches them                                                          │
│                                                                                                                       │
│ B1 — executeFrameStepped:                                                                                             │
│ - Compile a minimal patch (Const → Array → Grid → Render)                                                             │
│ - Run the generator to completion, collect all snapshots                                                              │
│ - Verify: phase sequence is pre-frame → phase1... → phase-boundary → phase2... → post-frame                           │
│ - Verify: final return matches executeFrame() output (compare slot values)                                            │
│ - NaN test: create patch with divide-by-zero, verify anomaly appears in snapshot                                      │
│                                                                                                                       │
│ B2 — StepDebugSession:                                                                                                │
│ - startFrame + repeated stepNext() → verify exhaustion returns null                                                   │
│ - Add step-index breakpoint, runToBreakpoint() stops at correct index                                                 │
│ - Add anomaly breakpoint with NaN-producing patch, verify it fires                                                    │
│ - runToPhaseEnd() from phase1 stops at phase-boundary                                                                 │
│ - dispose() mid-frame finishes safely                                                                                 │
│                                                                                                                       │
│ ---                                                                                                                   │
│ Future Work Items (Not Implemented Here)                                                                              │
│                                                                                                                       │
│ F1: exprToBlock Mapping in DebugIndexIR                                                                               │
│                                                                                                                       │
│ Gap: DebugIndexIR has stepToBlock and slotToBlock but no exprToBlock: Map<ValueExprId, BlockId>. The expression tree  │
│ walker can navigate structure but can't label nodes with their source block.                                          │
│ Work: During block lowering (src/compiler/backend/lower-blocks.ts), record which BlockId emitted each ValueExprId via │
│  IRBuilder. Add field to DebugIndexIR in src/compiler/ir/program.ts.                                                  │
│ Impact: Without this, expression tree view shows function names (sin, divide) but not block names (Oscillator.out).   │
│                                                                                                                       │
│ F2: Dockview Debugger Panel UI                                                                                        │
│                                                                                                                       │
│ Gap: No visual UI for the debugger — only programmatic API and MobX store.                                            │
│ Work: React panel with: step list (current highlighted), Play/Pause/Step/Run-to-Breakpoint controls, slot inspector   │
│ table, expression tree collapsible view. Register in panelRegistry.ts.                                                │
│ Impact: Without this, debugger is usable via console or test harness only.                                            │
│                                                                                                                       │
│ F3: Conditional Breakpoints                                                                                           │
│                                                                                                                       │
│ Gap: Only 4 breakpoint types (step-index, block-id, phase-boundary, anomaly). No "break when slot X > threshold" or   │
│ "break when value changes by > delta".                                                                                │
│ Work: Extend Breakpoint union with { kind: 'slot-condition'; slot: ValueSlot; predicate: (v: number) => boolean }.    │
│ Add matching logic in StepDebugSession.matchesBreakpoint().                                                           │
│ Extension point: Breakpoint type in StepDebugTypes.ts is a discriminated union designed for extension.                │
│                                                                                                                       │
│ F4: Temporal Comparison (Cross-Frame Diff)                                                                            │
│                                                                                                                       │
│ Gap: Snapshots are per-step within a frame. No diff showing "this slot was 0.5 last frame, now NaN."                  │
│ Work: Before each frame starts, snapshot watched slot values into a previousFrameValues: Map<ValueSlot, number>.      │
│ Include previousValue field in StepSnapshot.writtenSlots entries.                                                     │
│ Extension point: StepDebugSession.startFrame() is where the snapshot would be captured.                               │
│                                                                                                                       │
│ F5: Lane Identity via Continuity                                                                                      │
│                                                                                                                       │
│ Gap: Field inspection shows "lane 37 = (0.5, 0.3)" but can't say "that's circle #37 from the spiral instance."        │
│ Work: Integrate with ContinuityState.mappings to surface element identity. Requires reading continuity build/apply    │
│ step results.                                                                                                         │
│ Extension point: continuityMapBuild and continuityApply steps already yield snapshots; their writtenSlots would carry │
│  mapping data.                                                                                                        │
│                                                                                                                       │
│ F6: "Why Not Evaluated" Analysis                                                                                      │
│                                                                                                                       │
│ Gap: If a block/port has no value, no explanation of why (not in schedule, dependency pruned, event not fired, etc.). │
│ Work: Analyze the compiler's dependency graph and schedule generation output. Requires access to pass4-depgraph and   │
│ pass7-schedule outputs.                                                                                               │
│ Extension point: CompilationInspectorService already captures pass snapshots.                                         │
│                                                                                                                       │
│ ---                                                                                                                   │
│ Verification                                                                                                          │
│                                                                                                                       │
│ After implementation:                                                                                                 │
│                                                                                                                       │
│ 1. All existing tests pass — npm run test (especially runtime and compiler tests)                                     │
│ 2. SlotLookupCache extraction — executeFrame() produces identical output (compare f64 arrays before/after refactor)   │
│ 3. Generator parity — executeFrameStepped() return value matches executeFrame() for the same inputs (test with        │
│ compiled demo patches)                                                                                                │
│ 4. Anomaly detection — Construct a patch with intentional NaN (divide by zero), verify anomaly breakpoint fires at    │
│ the correct step                                                                                                      │
│ 5. Phase boundaries — Verify yield sequence is always pre-frame → N×phase1 → phase-boundary → M×phase2 → post-frame   │
│ 6. Breakpoints — Each of the 4 types tested in isolation                                                              │
│ 7. Store reactivity — Verify StepDebugStore observables update after stepNext() calls                                 │
╰───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯