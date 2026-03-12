import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import '../../all';
import { getBlockDefinition } from '../../registry';
import {
  canonicalMany,
  canonicalType,
  FLOAT,
  INT,
  SHAPE,
  instanceRef,
  unitNone,
  VEC2,
} from '../../../core/canonical-types';
import { createLinePathTopology, createParametricCubicPathTopology } from '../_topology-helpers';

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

describe('ParametricCurve2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ParametricCurve2D')).toBeDefined();
  });

  it('frontend compiles rect -> wobble -> parametric -> render pipeline', () => {
    const hcl = `
patch "Test Parametric Curve 2D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = wobble.phase
    }
  }

  block "Rect" "anchors" {
    width = 0.2
    height = 0.14
    outputs {
      controlPoints = wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "wobble" {
    amount = 0.04
    frequency = 2.5
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 80
    thickness = 0.02
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 16
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.22
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    expect(result.typedPatch.blocks.some((b) => b.type === 'ParametricCurve2D')).toBe(true);
  });

  it('rejects non-cubic control-point arity at block lowering boundary', () => {
    const definition = getBlockDefinition('ParametricCurve2D');
    expect(definition).toBeDefined();
    expect(() =>
      definition!.lower({
        ctx: {
          inferredInstance: undefined,
          instance: 'shape-instance',
          instances: new Map([
            ['cp3', { id: 'cp3', count: 3, maxCount: 3 }],
          ]),
          b: {},
          outTypes: [canonicalType(SHAPE)],
        },
        inputsById: {
          controlPoints: {
            id: 1,
            type: canonicalMany(VEC2, unitNone(), instanceRef('shape-domain', 'cp3')),
          },
          resolution: { id: 2, type: canonicalType(INT) },
          thickness: { id: 3, type: canonicalType(FLOAT) },
        },
      } as never),
    ).toThrow(/exactly 4 lanes/);
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

describe('ShapeTwist2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ShapeTwist2D')).toBeDefined();
  });

  it('frontend compiles rect -> twist -> parametric pipeline', () => {
    const hcl = `
patch "Test Shape Twist 2D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4500
    role = "timeRoot"
    outputs {
      phaseA = twist.phase
    }
  }

  block "Rect" "anchors" {
    width = 0.16
    height = 0.12
    outputs {
      controlPoints = twist.controlPoints
    }
  }

  block "ShapeTwist2D" "twist" {
    twistTurns = 0.8
    mix = 0.9
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 72
    thickness = 0.022
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 12
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.22
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    expect(result.typedPatch.blocks.some((b) => b.type === 'ShapeTwist2D')).toBe(true);
  });
});

describe('ShapePolarRipple2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ShapePolarRipple2D')).toBeDefined();
  });

  it('frontend compiles rect -> ripple -> parametric pipeline', () => {
    const hcl = `
patch "Test Shape Polar Ripple 2D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6200
    role = "timeRoot"
    outputs {
      phaseA = ripple.phase
    }
  }

  block "Rect" "anchors" {
    width = 0.14
    height = 0.14
    outputs {
      controlPoints = ripple.controlPoints
    }
  }

  block "ShapePolarRipple2D" "ripple" {
    amount = 0.04
    pointFrequency = 5
    radialFrequency = 3
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 80
    thickness = 0.02
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 10
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.24
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    expect(result.typedPatch.blocks.some((b) => b.type === 'ShapePolarRipple2D')).toBe(true);
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

describe('createParametricCubicPathTopology', () => {
  it('declares canonical cubic type-2 schema', () => {
    const topology = createParametricCubicPathTopology();
    expect(topology.closed).toBe(true);
    expect(topology.totalControlPoints).toBe(4);
    expect(topology.verbs.length).toBe(3);
    expect(topology.pointsPerVerb).toEqual([1, 3, 0]);
    expect(topology.params.map((p) => p.name)).toEqual(['resolution', 'thickness']);
  });
});
