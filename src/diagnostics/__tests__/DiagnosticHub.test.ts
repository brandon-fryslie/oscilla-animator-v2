import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticHub } from '../DiagnosticHub';
import { EventHub } from '../../events/EventHub';
import type { Diagnostic, DiagnosticCode } from '../types';
import type { Patch } from '../../graph/Patch';
import { blockId, type BlockId } from '../../types';
import type { GraphCommittedEvent, CompileBeginEvent, CompileEndEvent, ProgramSwappedEvent, RuntimeHealthSnapshotEvent } from '../../events/types';

// Helper functions to create valid test events
function createGraphCommittedEvent(overrides?: Partial<GraphCommittedEvent>): GraphCommittedEvent {
  return {
    type: 'GraphCommitted',
    patchId: 'patch-0',
    patchRevision: 1,
    reason: 'userEdit',
    diffSummary: {
      blocksAdded: 1,
      blocksRemoved: 0,
      edgesChanged: 0,
    },
    ...overrides,
  };
}

function createCompileBeginEvent(overrides?: Partial<CompileBeginEvent>): CompileBeginEvent {
  return {
    type: 'CompileBegin',
    compileId: 'c1',
    patchId: 'patch-0',
    patchRevision: 1,
    trigger: 'manual',
    ...overrides,
  };
}

function createCompileEndEvent(overrides?: Partial<CompileEndEvent>): CompileEndEvent {
  return {
    type: 'CompileEnd',
    compileId: 'c1',
    patchId: 'patch-0',
    patchRevision: 1,
    status: 'success',
    durationMs: 20,
    diagnostics: [],
    ...overrides,
  };
}

function createProgramSwappedEvent(overrides?: Partial<ProgramSwappedEvent>): ProgramSwappedEvent {
  return {
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision: 1,
    compileId: 'c1',
    swapMode: 'soft',
    ...overrides,
  };
}

function createRuntimeHealthSnapshotEvent(overrides?: Partial<RuntimeHealthSnapshotEvent>): RuntimeHealthSnapshotEvent {
  return {
    type: 'RuntimeHealthSnapshot',
    patchId: 'patch-0',
    activePatchRevision: 1,
    tMs: Date.now(),
    frameBudget: {
      fpsEstimate: 60,
      avgFrameMs: 16.7,
    },
    evalStats: {
      fieldMaterializations: 100,
      nanCount: 0,
      infCount: 0,
    },
    ...overrides,
  };
}

function createDiagnostic(overrides?: Partial<Diagnostic>): Diagnostic {
  return {
    id: 'E_TYPE_MISMATCH:block-b1:rev1',
    code: 'E_TYPE_MISMATCH' as DiagnosticCode,
    severity: 'error',
    domain: 'compile',
    title: 'Type Mismatch',
    message: 'Test diagnostic',
    primaryTarget: { kind: 'block', blockId: 'b1' },
    scope: { patchRevision: 1 },
    metadata: { firstSeenAt: Date.now(), lastSeenAt: Date.now(), occurrenceCount: 1 },
    ...overrides,
  };
}

describe('DiagnosticHub', () => {
  let events: EventHub;
  let hub: DiagnosticHub;
  let mockPatch: Patch;

  beforeEach(() => {
    events = new EventHub();
    mockPatch = {
      blocks: new Map([
        [
          blockId('b1'),
          {
            id: blockId('b1'),
            type: 'InfiniteTimeRoot',
            params: {},
            displayName: 'TimeRoot',
            domainId: null,
            role: { kind: 'timeRoot', meta: {} },
          },
        ],
      ]),
      edges: [],
    };

    hub = new DiagnosticHub(events, 'patch-0', () => mockPatch);
  });

  describe('Five-Event Subscription Contract', () => {
    it('should handle GraphCommitted event and run authoring validators', () => {
      // Remove TimeRoot to trigger E_TIME_ROOT_MISSING
      mockPatch = { blocks: new Map(), edges: [] };

      events.emit(createGraphCommittedEvent());

      const authoring = hub.getAuthoringSnapshot();
      expect(authoring).toHaveLength(1);
      expect(authoring[0].code).toBe('E_TIME_ROOT_MISSING');
    });

    it('should ignore GraphCommitted for different patchId', () => {
      mockPatch = { blocks: new Map(), edges: [] };

      events.emit(createGraphCommittedEvent({ patchId: 'patch-999' }));

      const authoring = hub.getAuthoringSnapshot();
      expect(authoring).toHaveLength(0);
    });

    it('should handle CompileBegin event', () => {
      events.emit(createCompileBeginEvent());
      // Implicit: no throw
      expect(hub).toBeDefined();
    });

    it('should handle CompileEnd event and replace compile snapshot', () => {
      const diagnostic = createDiagnostic({ scope: { patchRevision: 2 } });

      events.emit(createCompileEndEvent({
        patchRevision: 2,
        status: 'failure',
        diagnostics: [diagnostic],
      }));

      const snapshot = hub.getCompileSnapshot(2);
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0].id).toBe(diagnostic.id);
    });

    it('should replace (not merge) compile snapshot on multiple CompileEnd events', () => {
      const diagnostic1 = createDiagnostic({
        id: 'E_TYPE_MISMATCH:block-b1:rev2',
        scope: { patchRevision: 2 },
      });
      const diagnostic2 = createDiagnostic({
        id: 'E_CYCLE_DETECTED:block-b2:rev2',
        code: 'E_CYCLE_DETECTED' as DiagnosticCode,
        scope: { patchRevision: 2 },
      });

      events.emit(createCompileEndEvent({
        patchRevision: 2,
        diagnostics: [diagnostic1],
      }));

      expect(hub.getCompileSnapshot(2)).toHaveLength(1);

      events.emit(createCompileEndEvent({
        patchRevision: 2,
        diagnostics: [diagnostic2],
      }));

      const snapshot = hub.getCompileSnapshot(2);
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0].id).toBe(diagnostic2.id);
    });

    it('should handle ProgramSwapped event and update active revision', () => {
      const diagnostic = createDiagnostic({ scope: { patchRevision: 3 } });

      events.emit(createCompileEndEvent({
        patchRevision: 3,
        diagnostics: [diagnostic],
      }));

      expect(hub.getActive()).toHaveLength(0);

      events.emit(createProgramSwappedEvent({ patchRevision: 3 }));

      const active = hub.getActive();
      expect(active.length).toBeGreaterThan(0);
    });

    it('should handle RuntimeHealthSnapshot event', () => {
      const diagnostic = createDiagnostic({
        id: 'W_RUNTIME_PERF:block-b1:rev0',
        code: 'W_RENDER_SLOW' as DiagnosticCode,
        severity: 'warn',
        domain: 'runtime',
        scope: { patchRevision: 0 },
      });

      events.emit(createRuntimeHealthSnapshotEvent({
        diagnosticsDelta: {
          raised: [diagnostic],
          resolved: [],
        },
      }));

      const runtime = hub.getRuntimeDiagnostics();
      expect(runtime).toHaveLength(1);
      expect(runtime[0].id).toBe(diagnostic.id);
    });

    it('should remove resolved diagnostics from RuntimeHealthSnapshot', () => {
      const diagnostic = createDiagnostic({
        id: 'W_RUNTIME_PERF:block-b1:rev0',
        code: 'W_RENDER_SLOW' as DiagnosticCode,
        severity: 'warn',
        domain: 'runtime',
      });

      events.emit(createRuntimeHealthSnapshotEvent({
        diagnosticsDelta: {
          raised: [diagnostic],
          resolved: [],
        },
      }));

      expect(hub.getRuntimeDiagnostics()).toHaveLength(1);

      events.emit(createRuntimeHealthSnapshotEvent({
        diagnosticsDelta: {
          raised: [],
          resolved: [diagnostic.id],
        },
      }));

      expect(hub.getRuntimeDiagnostics()).toHaveLength(0);
    });
  });

  describe('Query Methods', () => {
    it('should return active diagnostics as union of compile + authoring', () => {
      const compileDiag = createDiagnostic({
        id: 'E_TYPE_MISMATCH:block-b1:rev1',
        scope: { patchRevision: 1 },
      });

      events.emit(createCompileEndEvent({
        patchRevision: 1,
        diagnostics: [compileDiag],
      }));

      events.emit(createProgramSwappedEvent({ patchRevision: 1 }));

      mockPatch = { blocks: new Map(), edges: [] };
      events.emit(createGraphCommittedEvent({ patchRevision: 1 }));

      const active = hub.getActive();
      expect(active.length).toBeGreaterThanOrEqual(2);
      const codes = active.map((d) => d.code);
      expect(codes).toContain('E_TYPE_MISMATCH');
      expect(codes).toContain('E_TIME_ROOT_MISSING');
    });

    it('should deduplicate diagnostics by ID in getActive', () => {
      const duplicateId = 'E_TYPE_MISMATCH:block-b1:rev1';
      const diag = createDiagnostic({ id: duplicateId, scope: { patchRevision: 1 } });

      events.emit(createCompileEndEvent({
        patchRevision: 1,
        diagnostics: [diag],
      }));

      events.emit(createProgramSwappedEvent({ patchRevision: 1 }));

      events.emit(createRuntimeHealthSnapshotEvent({
        activePatchRevision: 1,
        diagnosticsDelta: {
          raised: [diag],
          resolved: [],
        },
      }));

      const active = hub.getActive();
      const ids = active.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should return diagnostics for specific revision via getByRevision', () => {
      const diag1 = createDiagnostic({
        id: 'E_TYPE_MISMATCH:block-b1:rev1',
        scope: { patchRevision: 1 },
      });
      const diag2 = createDiagnostic({
        id: 'E_CYCLE_DETECTED:block-b2:rev2',
        code: 'E_CYCLE_DETECTED' as DiagnosticCode,
        scope: { patchRevision: 2 },
      });

      events.emit(createCompileEndEvent({
        patchRevision: 1,
        diagnostics: [diag1],
      }));

      events.emit(createCompileEndEvent({
        patchRevision: 2,
        diagnostics: [diag2],
      }));

      const rev1Diags = hub.getByRevision(1);
      expect(rev1Diags).toHaveLength(1);
      expect(rev1Diags[0].id).toBe(diag1.id);

      const rev2Diags = hub.getByRevision(2);
      expect(rev2Diags).toHaveLength(1);
      expect(rev2Diags[0].id).toBe(diag2.id);
    });

    it('should return empty array for nonexistent revision', () => {
      const diags = hub.getCompileSnapshot(999);
      expect(diags).toEqual([]);
    });

    it('should return copy of authoring snapshot (not reference)', () => {
      mockPatch = { blocks: new Map(), edges: [] };
      events.emit(createGraphCommittedEvent());

      const snapshot1 = hub.getAuthoringSnapshot();
      const snapshot2 = hub.getAuthoringSnapshot();

      expect(snapshot1).toEqual(snapshot2);
      expect(snapshot1).not.toBe(snapshot2);
    });
  });

  describe('Filtering', () => {
    let diagnostics: Diagnostic[];

    beforeEach(() => {
      diagnostics = [
        createDiagnostic({
          code: 'E_TYPE_MISMATCH' as DiagnosticCode,
          severity: 'error',
          domain: 'compile',
          primaryTarget: { kind: 'block', blockId: 'b1' },
        }),
        createDiagnostic({
          id: 'W_GRAPH_UNUSED_OUTPUT:port-b2:p1:rev1',
          code: 'W_GRAPH_UNUSED_OUTPUT' as DiagnosticCode,
          severity: 'warn',
          domain: 'authoring',
          primaryTarget: { kind: 'port', blockId: 'b2', portId: 'p1' },
        }),
        createDiagnostic({
          id: 'I_SILENT_VALUE_USED:port-b3:p1:rev2',
          code: 'I_SILENT_VALUE_USED' as DiagnosticCode,
          severity: 'info',
          domain: 'authoring',
          primaryTarget: { kind: 'port', blockId: 'b3', portId: 'p1' },
          scope: { patchRevision: 2 },
        }),
      ];
    });

    it('should filter by severity', () => {
      const filtered = hub.filter(diagnostics, { severity: 'error' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].severity).toBe('error');
    });

    it('should filter by multiple severities', () => {
      const filtered = hub.filter(diagnostics, { severity: ['error', 'warn'] });
      expect(filtered).toHaveLength(2);
    });

    it('should filter by domain', () => {
      const filtered = hub.filter(diagnostics, { domain: 'authoring' });
      expect(filtered).toHaveLength(2);
    });

    it('should filter by target kind', () => {
      const filtered = hub.filter(diagnostics, { targetKind: 'port' });
      expect(filtered).toHaveLength(2);
    });

    it('should filter by patch revision', () => {
      const filtered = hub.filter(diagnostics, { patchRevision: 1 });
      expect(filtered).toHaveLength(2);
    });

    it('should apply multiple filters', () => {
      const filtered = hub.filter(diagnostics, {
        severity: 'warn',
        domain: 'authoring',
        targetKind: 'port',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].code).toBe('W_GRAPH_UNUSED_OUTPUT');
    });
  });

  describe('Revision Tracking', () => {
    it('should increment diagnostics revision on GraphCommitted', () => {
      const initial = hub.getDiagnosticsRevision();
      events.emit(createGraphCommittedEvent());
      expect(hub.getDiagnosticsRevision()).toBe(initial + 1);
    });

    it('should increment diagnostics revision on CompileEnd', () => {
      const initial = hub.getDiagnosticsRevision();
      events.emit(createCompileEndEvent());
      expect(hub.getDiagnosticsRevision()).toBe(initial + 1);
    });

    it('should increment diagnostics revision on ProgramSwapped', () => {
      const initial = hub.getDiagnosticsRevision();
      events.emit(createProgramSwappedEvent());
      expect(hub.getDiagnosticsRevision()).toBe(initial + 1);
    });

    it('should increment diagnostics revision on RuntimeHealthSnapshot', () => {
      const initial = hub.getDiagnosticsRevision();
      events.emit(createRuntimeHealthSnapshotEvent({
        diagnosticsDelta: {
          raised: [],
          resolved: [],
        },
      }));
      expect(hub.getDiagnosticsRevision()).toBe(initial + 1);
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from all events on dispose', () => {
      const initialCount = events.listenerCount();
      hub.dispose();
      expect(events.listenerCount()).toBeLessThan(initialCount);
    });

    it('should be safe to call dispose multiple times', () => {
      hub.dispose();
      expect(() => hub.dispose()).not.toThrow();
    });
  });
});
