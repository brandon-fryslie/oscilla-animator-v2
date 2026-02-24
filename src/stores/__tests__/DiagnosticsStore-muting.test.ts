import { beforeEach, describe, expect, it } from 'vitest';
import { DiagnosticsStore } from '../DiagnosticsStore';
import type { Diagnostic } from '../../diagnostics/types';

function makeDiagnostic(id: string, severity: Diagnostic['severity']): Diagnostic {
  const now = Date.now();
  return {
    id,
    code: 'E_RUNTIME_ERROR',
    severity,
    domain: 'runtime',
    primaryTarget: { kind: 'block', blockId: 'b0' },
    title: `Diagnostic ${id}`,
    message: `Message ${id}`,
    scope: { patchRevision: 1 },
    metadata: {
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    },
  };
}

describe('DiagnosticsStore muting', () => {
  const d1 = makeDiagnostic('d1', 'warn');
  const d2 = makeDiagnostic('d2', 'error');

  let diagnostics: Diagnostic[];
  let store: DiagnosticsStore;

  beforeEach(() => {
    diagnostics = [d1, d2];
    const mockHub = {
      getActive: () => diagnostics,
      getByRevision: () => diagnostics,
      getCompileSnapshot: () => diagnostics,
      getDiagnosticsForBlock: () => diagnostics,
      getDiagnosticsForEdge: () => diagnostics,
      getDiagnosticsForPort: () => diagnostics,
      getAuthoringSnapshot: () => diagnostics,
      getRuntimeDiagnostics: () => diagnostics,
      filter: (input: readonly Diagnostic[], filter: { severity?: readonly Diagnostic['severity'][] }) => {
        if (!filter.severity) return [...input];
        return input.filter((diag) => filter.severity!.includes(diag.severity));
      },
    };
    store = new DiagnosticsStore(mockHub as any);
  });

  it('mutes existing diagnostics and excludes them from active diagnostics', () => {
    expect(store.activeDiagnostics.map((d) => d.id)).toEqual(['d1', 'd2']);

    const muted = store.muteDiagnostic('d1');

    expect(muted).toBe(true);
    expect(store.mutedDiagnosticIds).toEqual(['d1']);
    expect(store.activeDiagnostics.map((d) => d.id)).toEqual(['d2']);
  });

  it('returns false when muting unknown diagnostics', () => {
    expect(store.muteDiagnostic('missing')).toBe(false);
    expect(store.activeDiagnostics.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('allows unmuting and restoring visibility', () => {
    expect(store.muteDiagnostic('d1')).toBe(true);
    store.unmuteDiagnostic('d1');

    expect(store.mutedDiagnosticIds).toEqual([]);
    expect(store.activeDiagnostics.map((d) => d.id)).toEqual(['d1', 'd2']);
  });
});
