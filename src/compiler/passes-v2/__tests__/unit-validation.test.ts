/**
 * Unit Validation Tests
 *
 * Verifies that Pass 2 detects unit mismatches and emits appropriate warnings.
 */

import { describe, it, expect, vi } from 'vitest';
import { pass2TypeGraph } from '../pass2-types';
import type { NormalizedPatch } from '../../ir/patches';
import { signalTypeSignal } from '../../../core/canonical-types';
import { registerBlock } from '../../../blocks/registry';

describe('Unit Validation', () => {
  // Mock console.warn to capture warnings
  const originalWarn = console.warn;
  let warnings: string[] = [];

  beforeEach(() => {
    warnings = [];
    console.warn = vi.fn((...args: unknown[]) => {
      warnings.push(args.join(' '));
    });
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it('should emit warning when connecting phase to radians', () => {
    // Register test blocks with unit annotations
    registerBlock({
      type: 'TestPhaseSource',
      label: 'Test Phase Source',
      category: 'test',
      description: 'Outputs phase [0,1)',
      form: 'primitive',
      capability: 'pure',
      inputs: [],
      outputs: [
        { id: 'phase', label: 'Phase', type: signalTypeSignal('float', 'phase') },
      ],
      params: {},
      lower: () => ({ outputsById: {} }),
    });

    registerBlock({
      type: 'TestRadiansSink',
      label: 'Test Radians Sink',
      category: 'test',
      description: 'Expects radians input',
      form: 'primitive',
      capability: 'pure',
      inputs: [
        { id: 'angle', label: 'Angle', type: signalTypeSignal('float', 'radians') },
      ],
      outputs: [],
      params: {},
      lower: () => ({ outputsById: {} }),
    });

    const patch: NormalizedPatch = {
      id: 'test-patch',
      revision: 1,
      blocks: [
        { id: 'b1', type: 'TestPhaseSource', label: 'Source', config: {}, role: { kind: 'user' } },
        { id: 'b2', type: 'TestRadiansSink', label: 'Sink', config: {}, role: { kind: 'user' } },
      ],
      edges: [
        {
          id: 'e1',
          fromBlock: 0,
          fromPort: 'phase',
          toBlock: 1,
          toPort: 'angle',
          role: 'user',
        },
      ],
      blockOutputTypes: new Map(),
    };

    // Run pass2
    pass2TypeGraph(patch);

    // Verify warning was emitted
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('Unit Mismatch');
    expect(warnings[0]).toContain('phase');
    expect(warnings[0]).toContain('radians');
  });

  it('should not warn when units match', () => {
    registerBlock({
      type: 'TestPhaseSource2',
      label: 'Test Phase Source 2',
      category: 'test',
      description: 'Outputs phase [0,1)',
      form: 'primitive',
      capability: 'pure',
      inputs: [],
      outputs: [
        { id: 'phase', label: 'Phase', type: signalTypeSignal('float', 'phase') },
      ],
      params: {},
      lower: () => ({ outputsById: {} }),
    });

    registerBlock({
      type: 'TestPhaseSink',
      label: 'Test Phase Sink',
      category: 'test',
      description: 'Expects phase input',
      form: 'primitive',
      capability: 'pure',
      inputs: [
        { id: 'phase', label: 'Phase', type: signalTypeSignal('float', 'phase') },
      ],
      outputs: [],
      params: {},
      lower: () => ({ outputsById: {} }),
    });

    const patch: NormalizedPatch = {
      id: 'test-patch',
      revision: 1,
      blocks: [
        { id: 'b1', type: 'TestPhaseSource2', label: 'Source', config: {}, role: { kind: 'user' } },
        { id: 'b2', type: 'TestPhaseSink', label: 'Sink', config: {}, role: { kind: 'user' } },
      ],
      edges: [
        {
          id: 'e1',
          fromBlock: 0,
          fromPort: 'phase',
          toBlock: 1,
          toPort: 'phase',
          role: 'user',
        },
      ],
      blockOutputTypes: new Map(),
    };

    // Run pass2
    pass2TypeGraph(patch);

    // Verify no warning
    expect(warnings.length).toBe(0);
  });

  it('should not warn when no unit annotations', () => {
    registerBlock({
      type: 'TestNoUnitSource',
      label: 'Test No Unit Source',
      category: 'test',
      description: 'No unit annotation',
      form: 'primitive',
      capability: 'pure',
      inputs: [],
      outputs: [
        { id: 'value', label: 'Value', type: signalTypeSignal('float') },
      ],
      params: {},
      lower: () => ({ outputsById: {} }),
    });

    registerBlock({
      type: 'TestNoUnitSink',
      label: 'Test No Unit Sink',
      category: 'test',
      description: 'No unit annotation',
      form: 'primitive',
      capability: 'pure',
      inputs: [
        { id: 'value', label: 'Value', type: signalTypeSignal('float') },
      ],
      outputs: [],
      params: {},
      lower: () => ({ outputsById: {} }),
    });

    const patch: NormalizedPatch = {
      id: 'test-patch',
      revision: 1,
      blocks: [
        { id: 'b1', type: 'TestNoUnitSource', label: 'Source', config: {}, role: { kind: 'user' } },
        { id: 'b2', type: 'TestNoUnitSink', label: 'Sink', config: {}, role: { kind: 'user' } },
      ],
      edges: [
        {
          id: 'e1',
          fromBlock: 0,
          fromPort: 'value',
          toBlock: 1,
          toPort: 'value',
          role: 'user',
        },
      ],
      blockOutputTypes: new Map(),
    };

    // Run pass2
    pass2TypeGraph(patch);

    // Verify no warning (backwards compatible)
    expect(warnings.length).toBe(0);
  });
});
