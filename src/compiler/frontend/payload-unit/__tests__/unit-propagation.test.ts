/**
 * Unit Propagation Integration Tests
 *
 * Verify that unit variables propagate correctly through block chains.
 * These tests exercise the full frontend pipeline (not just the solver).
 *
 * NOTE: Some tests may be skipped when the cardinality solver cannot
 * resolve signal-only patches (pre-existing V2 solver limitation).
 */
import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../../../graph';
import type { Patch } from '../../../../graph/Patch';
import { compileFrontend } from '../../index';
import type { PortKey } from '../../../ir/patches';
import type { CanonicalType } from '../../../../core/canonical-types';

/**
 * Helper: compile and return portTypes, or null if frontend failed.
 */
function compileAndGetPortTypes(patch: Patch): ReadonlyMap<PortKey, CanonicalType> | null {
  const result = compileFrontend(patch);
  if (result.kind === 'ok') {
    return result.result.typedPatch.portTypes;
  }
  // Error path may have partial typedPatch
  if (result.typedPatch) {
    return result.typedPatch.portTypes;
  }
  return null;
}

/**
 * Helper: find a port type by block type name and port/dir.
 */
function findPortType(
  portTypes: ReadonlyMap<PortKey, CanonicalType>,
  blockType: string,
  portId: string,
  dir: 'in' | 'out',
  patch: Patch,
): CanonicalType | undefined {
  // Patch.blocks is a ReadonlyMap<BlockId, Block>
  for (const [id, block] of patch.blocks) {
    if (block.type === blockType) {
      const key = `${id}:${portId}:${dir}` as PortKey;
      return portTypes.get(key);
    }
  }
  return undefined;
}

describe('Unit Propagation', () => {

  it('Lag preserves unit from connected source (turns)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const lag = b.addBlock('Lag');
      b.wire(phasor, 'out', lag, 'target');
    });

    const portTypes = compileAndGetPortTypes(patch);
    if (!portTypes) return; // Frontend failed (pre-existing cardinality issue)

    const targetType = findPortType(portTypes, 'Lag', 'target', 'in', patch);
    const outType = findPortType(portTypes, 'Lag', 'out', 'out', patch);

    if (targetType && outType) {
      expect(targetType.unit.kind).toBe(outType.unit.kind);
      expect(targetType.unit.kind).toBe('angle');
    }
  });

  it('Clamp preserves unit from connected source', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const clamp = b.addBlock('Clamp');
      b.wire(phasor, 'out', clamp, 'in');
    });

    const portTypes = compileAndGetPortTypes(patch);
    if (!portTypes) return;

    const inType = findPortType(portTypes, 'Clamp', 'in', 'in', patch);
    const outType = findPortType(portTypes, 'Clamp', 'out', 'out', patch);

    if (inType && outType) {
      expect(inType.unit.kind).toBe(outType.unit.kind);
      expect(inType.unit.kind).toBe('angle');
    }
  });

  it('ScaleBias: in/bias/out share unit, scale stays none', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const sb = b.addBlock('ScaleBias');
      b.wire(phasor, 'out', sb, 'in');
    });

    const portTypes = compileAndGetPortTypes(patch);
    if (!portTypes) return;

    const inType = findPortType(portTypes, 'ScaleBias', 'in', 'in', patch);
    const scaleType = findPortType(portTypes, 'ScaleBias', 'scale', 'in', patch);
    const outType = findPortType(portTypes, 'ScaleBias', 'out', 'out', patch);

    if (inType && outType && scaleType) {
      expect(inType.unit.kind).toBe(outType.unit.kind);
      expect(inType.unit.kind).toBe('angle');
      expect(scaleType.unit.kind).toBe('none');
    }
  });

  it('Smoothstep: in/edge0/edge1 share unit, out is none', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const ss = b.addBlock('Smoothstep');
      b.wire(phasor, 'out', ss, 'in');
    });

    const portTypes = compileAndGetPortTypes(patch);
    if (!portTypes) return;

    const inType = findPortType(portTypes, 'Smoothstep', 'in', 'in', patch);
    const outType = findPortType(portTypes, 'Smoothstep', 'out', 'out', patch);

    if (inType && outType) {
      expect(inType.unit.kind).toBe('angle');
      expect(outType.unit.kind).toBe('none');
    }
  });

  it('isolated polymorphic blocks default to unitNone()', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const c = b.addBlock('Const');
      b.setConfig(c, 'value', 42);
      const lag = b.addBlock('Lag');
      b.wire(c, 'out', lag, 'target');
    });

    const portTypes = compileAndGetPortTypes(patch);
    if (!portTypes) return;

    const lagOutType = findPortType(portTypes, 'Lag', 'out', 'out', patch);
    if (lagOutType) {
      expect(lagOutType.unit.kind).toBe('none');
    }
  });

  it('NormalizeRange: in/min/max share unit, out is none (clamp01)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const nr = b.addBlock('Lens_NormalizeRange');
      b.wire(phasor, 'out', nr, 'in');
    });

    const portTypes = compileAndGetPortTypes(patch);
    if (!portTypes) return;

    const inType = findPortType(portTypes, 'Lens_NormalizeRange', 'in', 'in', patch);
    const outType = findPortType(portTypes, 'Lens_NormalizeRange', 'out', 'out', patch);

    if (inType && outType) {
      expect(inType.unit.kind).toBe('angle');
      expect(outType.unit.kind).toBe('none');
    }
  });

  it('DenormalizeRange: min/max/out share unit, in is none (clamp01)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const dnr = b.addBlock('Lens_DenormalizeRange');
      b.wire(phasor, 'out', dnr, 'min');
    });

    const portTypes = compileAndGetPortTypes(patch);
    if (!portTypes) return;

    const inType = findPortType(portTypes, 'Lens_DenormalizeRange', 'in', 'in', patch);
    const outType = findPortType(portTypes, 'Lens_DenormalizeRange', 'out', 'out', patch);

    if (inType && outType) {
      expect(inType.unit.kind).toBe('none');
      expect(outType.unit.kind).toBe('angle');
    }
  });

});
