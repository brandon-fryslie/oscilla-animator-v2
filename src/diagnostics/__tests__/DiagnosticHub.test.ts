import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticHub } from '../DiagnosticHub';
import { EventHub } from '../../events/EventHub';
import type { Patch } from '../../graph/Patch';
import { blockId } from '../../types';

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

    events.emit({
      type: 'GraphCommitted',
      patchId: 'patch-0',
      patchRevision: 1,
    });

    expect(hub.getDiagnosticsRevision()).toBe(initialRev + 1);
  });

  it('replaces compile snapshot on CompileEnd (not merge)', () => {
    // First compile with one error
    events.emit({
      type: 'CompileBegin',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
    });

    events.emit({
      type: 'CompileEnd',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
      success: false,
      errors: [
        {
          kind: 'TypeMismatch',
          edgeId: 'e1',
          fromType: 'signal<float>',
          toType: 'signal<vec2>',
        },
      ],
    });

    const firstDiagnostics = hub.getActive();
    expect(firstDiagnostics.length).toBe(1);
    expect(firstDiagnostics[0].code).toBe('E_TYPE_MISMATCH');

    // Second compile with different error (should REPLACE, not add)
    events.emit({
      type: 'CompileBegin',
      patchId: 'patch-0',
      patchRevision: 2,
      compileId: 'compile-2',
    });

    events.emit({
      type: 'CompileEnd',
      patchId: 'patch-0',
      patchRevision: 2,
      compileId: 'compile-2',
      success: false,
      errors: [
        {
          kind: 'NoTimeRoot',
        },
      ],
    });

    const secondDiagnostics = hub.getActive();
    expect(secondDiagnostics.length).toBe(1);
    expect(secondDiagnostics[0].code).toBe('E_TIME_ROOT_MISSING');
  });

  it('deduplicates by stable ID across revisions', () => {
    // Same error in different revisions → different IDs
    events.emit({
      type: 'CompileBegin',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
    });

    events.emit({
      type: 'CompileEnd',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
      success: false,
      errors: [{ kind: 'NoTimeRoot' }],
    });

    const firstId = hub.getActive()[0].id;

    events.emit({
      type: 'CompileBegin',
      patchId: 'patch-0',
      patchRevision: 2,
      compileId: 'compile-2',
    });

    events.emit({
      type: 'CompileEnd',
      patchId: 'patch-0',
      patchRevision: 2,
      compileId: 'compile-2',
      success: false,
      errors: [{ kind: 'NoTimeRoot' }],
    });

    const secondId = hub.getActive()[0].id;

    // Different IDs because patchRevision is in the ID
    expect(firstId).not.toBe(secondId);
  });

  it('filters by severity', () => {
    events.emit({
      type: 'CompileBegin',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
    });

    events.emit({
      type: 'CompileEnd',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
      success: false,
      errors: [
        { kind: 'NoTimeRoot' },
        { kind: 'TypeMismatch', edgeId: 'e1', fromType: 'signal<float>', toType: 'signal<vec2>' },
      ],
    });

    const errors = hub.getBySeverity('error');
    expect(errors.length).toBe(2);

    const fatal = hub.getBySeverity('fatal');
    expect(fatal.length).toBe(0);
  });

  it('filters by domain', () => {
    events.emit({
      type: 'GraphCommitted',
      patchId: 'patch-0',
      patchRevision: 1,
    });

    events.emit({
      type: 'CompileBegin',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
    });

    events.emit({
      type: 'CompileEnd',
      patchId: 'patch-0',
      patchRevision: 1,
      compileId: 'compile-1',
      success: false,
      errors: [{ kind: 'NoTimeRoot' }],
    });

    const authoring = hub.getByDomain('authoring');
    const compile = hub.getByDomain('compile');

    // Authoring validators may have run on GraphCommitted
    expect(compile.length).toBeGreaterThanOrEqual(1);
  });
});
