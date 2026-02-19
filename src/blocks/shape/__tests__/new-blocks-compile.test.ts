import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import '../../all';
import { getBlockDefinition } from '../../registry';
import { createLinePathTopology } from '../_topology-helpers';

describe('MakeShape2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('MakeShape2D')).toBeDefined();
  });

  it('frontend compiles with polygon input', () => {
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

  it('MakeShape2D shape → Array → Layout pipeline compiles', () => {
    const hcl = `
patch "Test Pipeline" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "ProceduralPolygon" "poly" {
    sides = 5
    radiusX = 0.04
    radiusY = 0.04
    outputs {
      controlPoints = assemble.controlPoints
    }
  }

  block "MakeShape2D" "assemble" {
    closed = 1
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 50
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.3
    outputs {
      position = render.pos
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const assembleBlock = result.typedPatch.blocks.find(b => b.type === 'MakeShape2D');
    expect(assembleBlock).toBeDefined();
    const renderBlock = result.typedPatch.blocks.find(b => b.type === 'RenderInstances2D');
    expect(renderBlock).toBeDefined();
  });
});

describe('createLinePathTopology', () => {
  it('produces correct verbs for closed path', () => {
    const closed5 = createLinePathTopology(5, true);
    expect(closed5.totalControlPoints).toBe(5);
    expect(closed5.verbs.length).toBe(6); // MOVE + 4 LINE + CLOSE
    expect(closed5.closed).toBe(true);
  });

  it('produces correct verbs for open path', () => {
    const open5 = createLinePathTopology(5, false);
    expect(open5.totalControlPoints).toBe(5);
    expect(open5.verbs.length).toBe(5); // MOVE + 4 LINE
    expect(open5.closed).toBe(false);
  });

  it('handles minimal 2-point path', () => {
    const min = createLinePathTopology(2, false);
    expect(min.totalControlPoints).toBe(2);
    expect(min.verbs.length).toBe(2); // MOVE + LINE
  });

  it('throws for fewer than 2 points', () => {
    expect(() => createLinePathTopology(1, false)).toThrow('at least 2 points');
  });
});
