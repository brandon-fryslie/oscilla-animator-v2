# Event System Evaluation

**Date:** 2026-01-27
**Topic:** Event System Implementation
**Spec Reference:** `design-docs/_new/01-Event-System.md`

---

## Verdict: CONTINUE

The path forward is clear. The new spec defines a broader application-wide event system that extends the existing diagnostic-focused EventHub. No blocking ambiguities.

---

## Current State Analysis

### Existing Infrastructure

**EventHub** (`src/events/EventHub.ts`)
- ✅ Well-implemented, type-safe, discriminated union event bus
- ✅ Synchronous emission, exception isolation
- ✅ 28 passing tests
- ⚠️ Currently focused on diagnostic events only

**Current Event Types** (`src/events/types.ts`)
```typescript
type EditorEvent =
  | GraphCommittedEvent      // Patch mutation committed
  | CompileBeginEvent        // Compilation started
  | CompileEndEvent          // Compilation finished
  | ProgramSwappedEvent      // Program activated in runtime
  | RuntimeHealthSnapshotEvent // Runtime health metrics
  | ParamChangedEvent        // Block params updated
  | BlockLoweredEvent        // Block lowered during compilation
```

**Current Emitters:**
- `RootStore`: Emits `GraphCommitted` (simplified)
- `compile.ts`: Emits `CompileBegin`, `CompileEnd`
- `pass6-block-lowering.ts`: Emits `BlockLowered`
- `PatchStore`: Can emit `ParamChanged` (partially wired)

**Current Subscribers:**
- `DiagnosticHub`: Subscribes to all 7 event types

### New Spec Requirements

The spec at `design-docs/_new/01-Event-System.md` defines a **different EventMap**:

```typescript
type EventMap = {
  // Patch Events (PatchStore emits)
  blockChanged: (blockId: BlockId) => void;
  blockAdded: (blockId: BlockId) => void;
  blockRemoved: (blockId: BlockId) => void;
  edgeAdded: (edgeId: EdgeId) => void;
  edgeRemoved: (edgeId: EdgeId) => void;
  patchReset: () => void;

  // Compilation Events (CompilationService emits)
  compileStarted: () => void;
  compileSucceeded: (program: CompiledProgram) => void;
  compileFailed: (errors: CompileError[]) => void;
  diagnosticsChanged: (diagnostics: Diagnostic[]) => void;

  // Runtime Events (RuntimeService emits)
  frameStarted: (frameNumber: number) => void;
  frameCompleted: (frameNumber: number) => void;
  playbackStateChanged: (state: 'playing' | 'paused' | 'stopped') => void;
  runtimeError: (error: RuntimeError) => void;

  // Selection Events (SelectionStore emits)
  selectionChanged: (selection: Selection) => void;
  hoverChanged: (hovered: HoverTarget | null) => void;

  // UI Events (UI components/stores emit)
  panelLayoutChanged: (layout: PanelLayout) => void;
  viewportChanged: (viewport: Viewport) => void;

  // Editor State (EditorStateStore emits) - from spec addendum
  editorStateChanged: (change: EditorStateChange) => void;
}
```

### Gap Analysis

| Spec Event | Current State | Gap |
|------------|---------------|-----|
| `blockChanged` | None | NEW |
| `blockAdded` | Partially via `GraphCommitted.diffSummary` | Split out |
| `blockRemoved` | Partially via `GraphCommitted.diffSummary` | Split out |
| `edgeAdded` | Partially via `GraphCommitted.diffSummary` | Split out |
| `edgeRemoved` | Partially via `GraphCommitted.diffSummary` | Split out |
| `patchReset` | None | NEW |
| `compileStarted` | `CompileBegin` | Rename/adapt |
| `compileSucceeded` | `CompileEnd` with status='success' | Adapt |
| `compileFailed` | `CompileEnd` with status='failure' | Adapt |
| `diagnosticsChanged` | Via `CompileEnd.diagnostics` | NEW (separate event) |
| `frameStarted` | None | NEW |
| `frameCompleted` | Via `RuntimeHealthSnapshot` (partial) | Split out |
| `playbackStateChanged` | None | NEW |
| `runtimeError` | Via `RuntimeHealthSnapshot.evalStats` | Split out |
| `selectionChanged` | None | NEW |
| `hoverChanged` | None | NEW |
| `panelLayoutChanged` | None | NEW |
| `viewportChanged` | None | NEW |
| `editorStateChanged` | None | NEW |

### Architecture Decisions

**Q: Coexist or Replace?**

The existing events (`CompileBegin`, `CompileEnd`, etc.) are deeply integrated with DiagnosticHub. Rather than breaking that:

1. **OPTION A**: Evolve the existing system to match the spec
   - Pros: No breaking changes to DiagnosticHub
   - Cons: May end up with semantic mismatches

2. **OPTION B**: Create a parallel `AppEventHub` for application events
   - Pros: Clean separation, spec-conformant API
   - Cons: Two event systems

3. **OPTION C (Recommended)**: Extend the existing system
   - Add new events to `EditorEvent` union
   - Rename existing events to match spec where sensible
   - Keep DiagnosticHub working during transition
   - Deprecate old events after migration

**Decision: OPTION C** - Extend existing system, migrate gradually.

---

## Implementation Strategy

### Sprint 1: Core Infrastructure (HIGH confidence)
- Add new event types to `EditorEvent` union
- Create the callback-style API (`on(event, handler)` variant for spec compliance)
- Add `once()` method as spec requires
- Keep existing discriminated union working

### Sprint 2: Patch Events (HIGH confidence)
- Add fine-grained patch mutation events
- Wire PatchStore to emit `blockAdded`, `blockRemoved`, `edgeAdded`, `edgeRemoved`
- Add `blockChanged` for input/config changes
- Add `patchReset` for file operations

### Sprint 3: Runtime & Selection Events (MEDIUM confidence)
- Add frame events (`frameStarted`, `frameCompleted`)
- Add `playbackStateChanged`, `runtimeError`
- Wire SelectionStore to emit selection events
- Add hover tracking

### Sprint 4: Editor State Coordination (MEDIUM confidence)
- Implement `EditorStateStore`
- Add `editorStateChanged` event
- Wire editors to coordinate via events

### Sprint 5: UI Events (LOW confidence)
- `panelLayoutChanged` - Dockview integration needed
- `viewportChanged` - ReactFlow viewport tracking

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DiagnosticHub breakage | Low | High | Keep existing events until migration complete |
| Event type explosion | Medium | Medium | Strict single-emitter ownership per spec |
| Performance (event spam) | Low | Medium | Consider debouncing for high-frequency events |
| Cascading event loops | Medium | High | Enforce spec rules: idempotent listeners, no cycles |

---

## Dependencies

- No external dependencies
- Internal: PatchStore, SelectionStore, RuntimeService, UI components

---

## Notes

- The spec is clear and well-designed
- Ownership table in spec prevents multiple emitters
- Cascading rules prevent infinite loops
- Editor state coordination is the most complex feature (Sprint 4)
