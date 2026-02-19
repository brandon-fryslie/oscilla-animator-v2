import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import '../../all';
import { getBlockDefinition } from '../../registry';
import { createLinePathTopology } from '../_topology-helpers';

describe('new shape blocks', () => {
  it('SpiralGenerator is registered', () => {
    expect(getBlockDefinition('SpiralGenerator')).toBeDefined();
  });

  it('MakeShape2D is registered', () => {
    expect(getBlockDefinition('MakeShape2D')).toBeDefined();
  });

  it('SpiralGenerator frontend compiles', () => {
    const hcl = `
patch "Test Spiral" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "SpiralGenerator" "spiral" {
    resolution = 48
    turns = 3
    growth = 0.12
  }
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    // Check that SpiralGenerator produced typed ports
    const spiralBlock = result.typedPatch.blocks.find(b => b.type === 'SpiralGenerator');
    expect(spiralBlock).toBeDefined();
    expect(spiralBlock!.outputPorts.size).toBeGreaterThan(0);
  });

  it('MakeShape2D frontend compiles with polygon input', () => {
    const hcl = `
patch "Test Assemble" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "ProceduralPolygon" "hex" {
    sides = 6
    radiusX = 0.08
    radiusY = 0.08
    outputs {
      controlPoints = assemble.controlPoints
    }
  }

  block "MakeShape2D" "assemble" {
    closed = 1
  }
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const assembleBlock = result.typedPatch.blocks.find(b => b.type === 'MakeShape2D');
    expect(assembleBlock).toBeDefined();
    expect(assembleBlock!.outputPorts.size).toBeGreaterThan(0);
  });

  it('createLinePathTopology produces correct verbs', () => {
    // Closed path: MOVE + (N-1) LINE + CLOSE
    const closed5 = createLinePathTopology(5, true);
    expect(closed5.totalControlPoints).toBe(5);
    expect(closed5.verbs.length).toBe(6); // MOVE + 4 LINE + CLOSE
    expect(closed5.closed).toBe(true);

    // Open path: MOVE + (N-1) LINE
    const open5 = createLinePathTopology(5, false);
    expect(open5.totalControlPoints).toBe(5);
    expect(open5.verbs.length).toBe(5); // MOVE + 4 LINE
    expect(open5.closed).toBe(false);

    // Minimal: 2 points
    const min = createLinePathTopology(2, false);
    expect(min.totalControlPoints).toBe(2);
    expect(min.verbs.length).toBe(2); // MOVE + LINE

    // Error: <2 points
    expect(() => createLinePathTopology(1, false)).toThrow('at least 2 points');
  });
});
