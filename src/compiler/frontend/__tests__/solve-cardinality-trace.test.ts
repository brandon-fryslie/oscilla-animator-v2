/**
 * Cardinality Solver Trace Mode Tests
 *
 * Verify that trace=true produces console output with phase headers,
 * trace=false produces zero output, and trace doesn't affect results.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { solveCardinality, type SolveCardinalityInput } from '../solve-cardinality';
import type { PortKey } from '../analyze-type-constraints';
import type { BlockIndex } from '../../ir/patches';
import {
  canonicalSignal,
  cardinalityMany,
  instanceRef,
  FLOAT,
  unitNone,
} from '../../../core/canonical-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pk(blockIndex: number, portName: string, dir: 'in' | 'out'): PortKey {
  return `${blockIndex}:${portName}:${dir}` as PortKey;
}

function makeSimpleInput(): SolveCardinalityInput {
  const ref = instanceRef('circle', 'inst-0');
  const signalType = canonicalSignal(FLOAT, unitNone());
  const fieldType = {
    ...signalType,
    extent: { ...signalType.extent, cardinality: cardinalityMany(ref) },
  };

  const portTypes = new Map<PortKey, typeof signalType>([
    [pk(0, 'freq', 'out'), signalType],
    [pk(1, 'x', 'in'), fieldType],
    [pk(1, 'out', 'out'), fieldType],
  ]);

  return {
    portTypes,
    constraints: [
      { kind: 'fixed', port: pk(0, 'freq', 'out'), value: { kind: 'one' } },
      {
        kind: 'equal',
        varId: 'block:1' as any,
        ports: [pk(1, 'x', 'in'), pk(1, 'out', 'out')],
      },
    ],
    edges: [
      { fromBlock: 0 as BlockIndex, fromPort: 'freq', toBlock: 1 as BlockIndex, toPort: 'x' },
    ],
    blockName: (idx: BlockIndex) => `TestBlock${idx}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('solveCardinality trace mode', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('trace=false produces zero console.log calls', () => {
    const input = makeSimpleInput();
    solveCardinality({ ...input, trace: false });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('trace=undefined (default) produces zero console.log calls', () => {
    const input = makeSimpleInput();
    solveCardinality(input);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('trace=true produces console output with phase headers', () => {
    const input = makeSimpleInput();
    solveCardinality({ ...input, trace: true });

    expect(consoleSpy).toHaveBeenCalled();
    const allOutput = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allOutput).toContain('Phase 1');
    expect(allOutput).toContain('Phase 2');
    expect(allOutput).toContain('Phase 3');
    expect(allOutput).toContain('Phase 4');
    expect(allOutput).toContain('Phase 5');
    expect(allOutput).toContain('Done');
  });

  it('trace=true does not change solver results (purity)', () => {
    const input = makeSimpleInput();

    const resultWithoutTrace = solveCardinality({ ...input, trace: false });

    consoleSpy.mockClear();
    const resultWithTrace = solveCardinality({ ...input, trace: true });

    // Same errors
    expect(resultWithTrace.errors.length).toBe(resultWithoutTrace.errors.length);

    // Same resolved port types
    expect(resultWithTrace.portTypes.size).toBe(resultWithoutTrace.portTypes.size);
    for (const [key, type] of resultWithTrace.portTypes) {
      const other = resultWithoutTrace.portTypes.get(key);
      expect(other).toBeDefined();
      expect(type.extent.cardinality).toEqual(other!.extent.cardinality);
    }
  });

  it('trace output includes block names when provided', () => {
    const input = makeSimpleInput();
    solveCardinality({ ...input, trace: true });

    const allOutput = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allOutput).toContain('TestBlock');
  });
});
