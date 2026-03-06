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
    closed = true
  }
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const assembleIndex = result.typedPatch.blocks.findIndex(b => b.type === 'MakeShape2D');
    expect(assembleIndex).toBeGreaterThanOrEqual(0);
    const outputCount = Array.from(result.typedPatch.portTypes.keys())
      .filter(key => key.startsWith(`${assembleIndex}:`) && key.endsWith(':out')).length;
    expect(outputCount).toBeGreaterThan(0);
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
    closed = true
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
      controlPoints = render.controlPoints
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

describe('ShapeWobble2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ShapeWobble2D')).toBeDefined();
  });

  it('frontend compiles generator -> wobble -> assembler pipeline', () => {
    const hcl = `
patch "Test Shape Wobble" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
    outputs {
      phaseA = wobble.phase
    }
  }

  block "Rect" "shape" {
    width = 0.08
    height = 0.04
    outputs {
      controlPoints = wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "wobble" {
    amount = 0.01
    frequency = 5
    outputs {
      points = assemble.controlPoints
    }
  }

  block "MakeShape2D" "assemble" {
    closed = true
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 24
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.3
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;

    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    expect(result.typedPatch.blocks.some((b) => b.type === 'ShapeWobble2D')).toBe(true);
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
