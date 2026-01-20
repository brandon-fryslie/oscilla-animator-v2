import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticHub } from '../DiagnosticHub';
import { EventHub } from '../../events/EventHub';
import type { Patch } from '../../graph/Patch';
import type { Diagnostic, DiagnosticCode } from '../types';
import type {
  GraphCommittedEvent,
  CompileBeginEvent,
  CompileEndEvent,
  ProgramSwappedEvent,
} from '../../events/types';
import { blockId } from '../../types';

// =============================================================================
// Test Helpers - Construct valid event shapes
// =============================================================================

function makeGraphCommitted(patchRevision: number): GraphCommittedEvent {
  return {
    type: 'GraphCommitted',
    patchId: 'patch-0',
    patchRevision,
    reason: 'userEdit',
    diffSummary: { blocksAdded: 0, blocksRemoved: 0, edgesChanged: 0 },
  };
}

function makeCompileBegin(
  patchRevision: number,
  compileId: string
): CompileBeginEvent {
  return {
    type: 'CompileBegin',
    patchId: 'patch-0',
    patchRevision,
    compileId,
    trigger: 'graphCommitted',
  };
}

function makeCompileEnd(
  patchRevision: number,
  compileId: string,
  diagnostics: Diagnostic[]
): CompileEndEvent {
  return {
    type: 'CompileEnd',
    patchId: 'patch-0',
    patchRevision,
    compileId,
    status: diagnostics.length > 0 ? 'failure' : 'success',
    durationMs: 10,
    diagnostics,
  };
}

function makeProgramSwapped(
  patchRevision: number,
  compileId: string
): ProgramSwappedEvent {
  return {
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision,
    compileId,
    swapMode: 'hard',
  };
}

function makeDiagnostic(
  code: DiagnosticCode,
  patchRevision: number,
  overrides?: Partial<Diagnostic>
): Diagnostic {
  const now = Date.now();
  return {
    id: `${code}:block-b1:rev${patchRevision}`,
    code,
    severity: 'error',
    domain: 'compile',
    primaryTarget: { kind: 'block', blockId: 'b1' },
    title: `Test diagnostic for ${code}`,
    message: 'Test message',
    scope: { patchRevision },
    metadata: { firstSeenAt: now, lastSeenAt: now, occurrenceCount: 1 },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

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
            inputPorts: new Map(),
            outputPorts: new Map(),
          },
        ],
      ]),
      edges: [],
    };

    hub = new DiagnosticHub(events, 'patch-0', () => mockPatch);
  });

  it('initializes with empty diagnostics', () => {
    expect(hub.getActive()).toEqual([]);
    expect(hub.getDiagnosticsRevision()).toBe(0);
  });

  it('increments revision on authoring validation', () => {
    const initialRev = hub.getDiagnosticsRevision();

    events.emit(makeGraphCommitted(1));

    expect(hub.getDiagnosticsRevision()).toBe(initialRev + 1);
  });

  it('replaces compile snapshot on CompileEnd (not merge)', () => {
    // First compile with one error
    events.emit(makeCompileBegin(1, 'compile-1'));
    events.emit(
      makeCompileEnd(1, 'compile-1', [
        makeDiagnostic('E_TYPE_MISMATCH', 1, {
          primaryTarget: { kind: 'port', blockId: 'b1', portId: 'p1' },
        }),
      ])
    );
    // Activate revision 1 to make getActive() return its diagnostics
    events.emit(makeProgramSwapped(1, 'compile-1'));

    const firstDiagnostics = hub.getActive();
    expect(firstDiagnostics.length).toBe(1);
    expect(firstDiagnostics[0].code).toBe('E_TYPE_MISMATCH');

    // Second compile with different error (should REPLACE, not add)
    events.emit(makeCompileBegin(2, 'compile-2'));
    events.emit(
      makeCompileEnd(2, 'compile-2', [
        makeDiagnostic('E_TIME_ROOT_MISSING', 2, {
          primaryTarget: { kind: 'timeRoot', blockId: '' },
        }),
      ])
    );
    // Activate revision 2
    events.emit(makeProgramSwapped(2, 'compile-2'));

    const secondDiagnostics = hub.getActive();
    expect(secondDiagnostics.length).toBe(1);
    expect(secondDiagnostics[0].code).toBe('E_TIME_ROOT_MISSING');
  });

  it('deduplicates by stable ID across revisions', () => {
    // Same error in different revisions → different IDs
    events.emit(makeCompileBegin(1, 'compile-1'));
    events.emit(
      makeCompileEnd(1, 'compile-1', [
        makeDiagnostic('E_TIME_ROOT_MISSING', 1, {
          id: 'E_TIME_ROOT_MISSING:timeRoot-none:rev1',
          primaryTarget: { kind: 'timeRoot', blockId: '' },
        }),
      ])
    );
    events.emit(makeProgramSwapped(1, 'compile-1'));

    const firstId = hub.getActive()[0].id;

    events.emit(makeCompileBegin(2, 'compile-2'));
    events.emit(
      makeCompileEnd(2, 'compile-2', [
        makeDiagnostic('E_TIME_ROOT_MISSING', 2, {
          id: 'E_TIME_ROOT_MISSING:timeRoot-none:rev2',
          primaryTarget: { kind: 'timeRoot', blockId: '' },
        }),
      ])
    );
    events.emit(makeProgramSwapped(2, 'compile-2'));

    const secondId = hub.getActive()[0].id;

    // Different IDs because patchRevision is in the ID
    expect(firstId).not.toBe(secondId);
  });

  it('filters by severity', () => {
    events.emit(makeCompileBegin(1, 'compile-1'));
    events.emit(
      makeCompileEnd(1, 'compile-1', [
        makeDiagnostic('E_TIME_ROOT_MISSING', 1, {
          id: 'E_TIME_ROOT_MISSING:block-b1:rev1',
          severity: 'error',
        }),
        makeDiagnostic('E_TYPE_MISMATCH', 1, {
          id: 'E_TYPE_MISMATCH:port-b1-p1:rev1',
          severity: 'error',
          primaryTarget: { kind: 'port', blockId: 'b1', portId: 'p1' },
        }),
      ])
    );
    events.emit(makeProgramSwapped(1, 'compile-1'));

    const errors = hub.getBySeverity('error');
    expect(errors.length).toBe(2);

    const fatal = hub.getBySeverity('fatal');
    expect(fatal.length).toBe(0);
  });

  it('filters by domain', () => {
    events.emit(makeGraphCommitted(1));

    events.emit(makeCompileBegin(1, 'compile-1'));
    events.emit(
      makeCompileEnd(1, 'compile-1', [
        makeDiagnostic('E_TIME_ROOT_MISSING', 1, {
          domain: 'compile',
        }),
      ])
    );
    events.emit(makeProgramSwapped(1, 'compile-1'));

    const authoring = hub.getByDomain('authoring');
    const compile = hub.getByDomain('compile');

    // Authoring validators may have run on GraphCommitted (but mockPatch has a TimeRoot)
    // Compile domain should have at least the E_TIME_ROOT_MISSING we added
    expect(compile.length).toBeGreaterThanOrEqual(1);
  });
});
