Event System Spec (Full Application)

Note: this is an event system for the application, and does not in any way relate to events in the patch.

Overview

A global event system for reactive application state changes. Events 
fire when state changes, allowing decoupled listeners to respond. 
Covers patch
 mutations, UI state, runtime, and compilation.

Event Categories

Patch Events

onBlockChanged(blockId: BlockId)
- Input values changed (wired or config)
- Vararg connections added/removed
- Display name changed
- Block params changed

onBlockAdded(blockId: BlockId)
- New block created in patch

onBlockRemoved(blockId: BlockId)
- Block deleted from patch

onEdgeAdded(edgeId: EdgeId)
- New edge created

onEdgeRemoved(edgeId: EdgeId)
- Edge deleted

onPatchReset()
- Entire patch replaced (new file, undo, load)

Compilation Events

onCompileStarted()
- Compilation began

onCompileSucceeded(program: CompiledProgram)
- Compilation finished successfully

onCompileFailed(errors: CompileError[])
- Compilation finished with errors

onDiagnosticsChanged(diagnostics: Diagnostic[])
- Warnings, hints, or other non-fatal diagnostics updated

Runtime Events

onFrameStarted(frameNumber: number)
- Frame execution beginning

onFrameCompleted(frameNumber: number)
- Frame execution finished

onPlaybackStateChanged(state: 'playing' | 'paused' | 'stopped')
- Playback state changed

onRuntimeError(error: RuntimeError)
- Runtime error occurred (NaN, overflow, etc.)

Selection Events

onSelectionChanged(selection: Selection)
- Selected block/edge/port changed

onHoverChanged(hovered: HoverTarget | null)
- Hovered element changed

UI Events

onPanelLayoutChanged(layout: PanelLayout)
- Dockview panels rearranged

onViewportChanged(viewport: Viewport)
- Graph editor pan/zoom changed

EventHub Interface

type EventMap = {
  blockChanged: (blockId: BlockId) => void;
  blockAdded: (blockId: BlockId) => void;
  blockRemoved: (blockId: BlockId) => void;
  edgeAdded: (edgeId: EdgeId) => void;
  edgeRemoved: (edgeId: EdgeId) => void;
  patchReset: () => void;

  compileStarted: () => void;
  compileSucceeded: (program: CompiledProgram) => void;
  compileFailed: (errors: CompileError[]) => void;
  diagnosticsChanged: (diagnostics: Diagnostic[]) => void;

  frameStarted: (frameNumber: number) => void;
  frameCompleted: (frameNumber: number) => void;
  playbackStateChanged: (state: 'playing' | 'paused' | 'stopped') => void;
  runtimeError: (error: RuntimeError) => void;

  selectionChanged: (selection: Selection) => void;
  hoverChanged: (hovered: HoverTarget | null) => void;

  panelLayoutChanged: (layout: PanelLayout) => void;
  viewportChanged: (viewport: Viewport) => void;
};

interface EventHub {
  on<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void;
  emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>): void;
  once<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void;
}

Ownership

Each event type has a single emitter (owner):
┌────────────────────┬─────────────────────────────────┐
│   Event Category   │             Emitter             │
├────────────────────┼─────────────────────────────────┤
│ Patch events       │ PatchStore                      │
├────────────────────┼─────────────────────────────────┤
│ Compilation events │ CompilationService              │
├────────────────────┼─────────────────────────────────┤
│ Runtime events     │ RuntimeService                  │
├────────────────────┼─────────────────────────────────┤
│ Selection events   │ SelectionStore                  │
├────────────────────┼─────────────────────────────────┤
│ UI events          │ Respective UI components/stores │
└────────────────────┴─────────────────────────────────┘
No event has multiple emitters. Single source of truth.

Cascading

Events may trigger listeners that cause further state changes, which 
fire more events.

Rules:
1. Listeners must be idempotent - if nothing to do, don't mutate
2. Listeners must not create cycles - A triggers B triggers A
3. Keep cascade depth shallow - if you need 5+ levels, reconsider 
design

Example cascade:
onBlockRemoved(A)
  → listener removes edges connected to A
    → onEdgeRemoved(edge1)
    → onEdgeRemoved(edge2)
      → listener cleans up vararg connections referencing A
        → onBlockChanged(ExpressionBlock)
          → no further changes needed, cascade ends

Timing

Synchronous: Events fire immediately after mutation completes. No 
batching.

Post-mutation: Events fire after the state change is complete, not 
before. Listeners see consistent state.

Order: Listeners fire in registration order.

Error Handling

Listener errors are caught and logged. One listener throwing does 
not prevent other listeners from running.

emit(event, ...args) {
  for (const handler of listeners[event]) {
    try {
      handler(...args);
    } catch (e) {
      console.error(`Event listener error for ${event}:`, e);
    }
  }
}

React Integration

EventHub is available via context or direct import. Not a MobX 
observable - listeners manually trigger re-renders if needed (via 
MobX actions in
stores, or setState in components).

// In a store
constructor(eventHub: EventHub) {
  eventHub.on('compileSucceeded', (program) => {
    runInAction(() => {
      this.currentProgram = program;
    });
  });
}

Lifecycle

EventHub is created at app startup, before stores. Stores receive 
EventHub via constructor injection.

Unsubscribe functions must be called on cleanup (component unmount, 
store disposal).

Debug Mode

Optional debug logging:

eventHub.enableDebug(true);
// Logs: [EventHub] blockChanged(block-123)
// Logs: [EventHub]   → 3 listeners notified

Use Cases

Expression vararg cleanup: onBlockChanged → parse expression → 
remove unused vararg connections

Auto-recompile: onBlockChanged / onEdgeAdded / onEdgeRemoved → 
debounce → trigger compile

Diagnostics panel: onDiagnosticsChanged → update UI

Undo/redo: onPatchReset → clear transient state, re-sync UI

Debug values: onFrameCompleted → update debug value displays

Selection sync: onBlockRemoved → if removed block was selected, 
clear selection