/**
 * Unit Validation Tests
 *
 * Verifies that Pass 2 detects unit mismatches and emits appropriate warnings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pass2TypeGraph } from '../pass2-types';
import { pass1TypeConstraints, type TypeResolvedPatch } from '../pass1-type-constraints';
import type { NormalizedPatch } from '../../ir/patches';
import { signalTypeSignal, unitPhase01, unitRadians, unitScalar } from '../../../core/canonical-types';
import { registerBlock } from '../../../blocks/registry';

/** Helper to run pass1 and pass2 in sequence */
function runPass1AndPass2(patch: NormalizedPatch) {
  const pass1Result = pass1TypeConstraints(patch);
  if ('kind' in pass1Result && pass1Result.kind === 'error') {
    throw new Error(`Pass1 error: ${pass1Result.errors.map((e) => e.message).join(', ')}`);
  }
  return pass2TypeGraph(pass1Result as TypeResolvedPatch);
}

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

  it('should reject connecting phase01 to radians (unit mismatch is hard error)', () => {
    // Register test blocks with unit annotations
    registerBlock({
      type: 'TestPhaseSource',
      label: 'Test Phase Source',
      category: 'test',
      description: 'Outputs phase [0,1)',
      form: 'primitive',
      capability: 'pure',
      inputs: {},
      outputs: {
        phase: { label: 'Phase', type: signalTypeSignal('float', unitPhase01()) },
      },
      lower: () => ({ outputsById: {} }),
    });

    registerBlock({
      type: 'TestRadiansSink',
      label: 'Test Radians Sink',
      category: 'test',
      description: 'Expects radians input',
      form: 'primitive',
      capability: 'pure',
      inputs: {
        angle: { label: 'Angle', type: signalTypeSignal('float', unitRadians()) },
      },
      outputs: {},
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

    // Unit mismatch is now a hard error (requires adapter)
    expect(() => runPass1AndPass2(patch)).toThrow(/Type mismatch|conflict/i);
  });

  it('should not warn when units match', () => {
    registerBlock({
      type: 'TestPhaseSource2',
      label: 'Test Phase Source 2',
      category: 'test',
      description: 'Outputs phase [0,1)',
      form: 'primitive',
      capability: 'pure',
      inputs: {},
      outputs: {
        phase: { label: 'Phase', type: signalTypeSignal('float', unitPhase01()) },
      },
      lower: () => ({ outputsById: {} }),
    });

    registerBlock({
      type: 'TestPhaseSink',
      label: 'Test Phase Sink',
      category: 'test',
      description: 'Expects phase input',
      form: 'primitive',
      capability: 'pure',
      inputs: {
        phase: { label: 'Phase', type: signalTypeSignal('float', unitPhase01()) },
      },
      outputs: {},
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

    // Run pass1 then pass2
    runPass1AndPass2(patch);

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
      inputs: {},
      outputs: {
        value: { label: 'Value', type: signalTypeSignal('float') },
      },
      lower: () => ({ outputsById: {} }),
    });

    registerBlock({
      type: 'TestNoUnitSink',
      label: 'Test No Unit Sink',
      category: 'test',
      description: 'No unit annotation',
      form: 'primitive',
      capability: 'pure',
      inputs: {
        value: { label: 'Value', type: signalTypeSignal('float') },
      },
      outputs: {},
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

    // Run pass1 then pass2
    runPass1AndPass2(patch);

    // Verify no warning (backwards compatible)
    expect(warnings.length).toBe(0);
  });
});
