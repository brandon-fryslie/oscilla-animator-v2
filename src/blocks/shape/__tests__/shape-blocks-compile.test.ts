import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import { compile } from '../../../compiler/compile';
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
import {
  createLinePathTopology,
  createParametricCubicPathTopology,
} from '../_topology-helpers';

function expectFullCompileOk(hcl: string): void {
  // [LAW:one-source-of-truth] Full-pipeline compile assertions are centralized
  // so every shape test uses one deterministic success criterion.
  const { patch, errors } = deserializePatchFromHCL(hcl);
  expect(errors).toEqual([]);
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(result.errors.map((err) => err.message).join('\n'));
  }
  expect(result.kind).toBe('ok');
}

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

describe('ShapeLissajous2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ShapeLissajous2D')).toBeDefined();
  });

  it('frontend compiles rect -> lissajous -> parametric pipeline', () => {
    const hcl = `
patch "Test Shape Lissajous 2D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5300
    role = "timeRoot"
    outputs {
      phaseA = liss.phase
    }
  }

  block "Rect" "anchors" {
    width = 0.16
    height = 0.12
    outputs {
      controlPoints = liss.controlPoints
    }
  }

  block "ShapeLissajous2D" "liss" {
    amountX = 0.04
    amountY = 0.03
    freqX = 4
    freqY = 6
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 84
    thickness = 0.02
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 14
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
    expect(result.typedPatch.blocks.some((b) => b.type === 'ShapeLissajous2D')).toBe(true);
  });

  it('full compile succeeds for type-2 lissajous pipeline', () => {
    const hcl = `
patch "Shape Lissajous Full Compile" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6100
    role = "timeRoot"
    outputs {
      phaseA = liss.phase
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.17
    radiusY = 0.11
    outputs {
      controlPoints = liss.controlPoints
    }
  }

  block "ShapeLissajous2D" "liss" {
    amountX = 0.045
    amountY = 0.032
    freqX = 4.5
    freqY = 7.25
    phaseSkew = 1.2
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 98
    thickness = 0.025
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 18
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.32
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    expectFullCompileOk(hcl);
  });
});

describe('ShapeRadialPulse2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ShapeRadialPulse2D')).toBeDefined();
  });

  it('frontend compiles rect -> radial pulse -> parametric pipeline', () => {
    const hcl = `
patch "Test Shape Radial Pulse 2D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5100
    role = "timeRoot"
    outputs {
      phaseA = pulse.phase
    }
  }

  block "Rect" "anchors" {
    width = 0.14
    height = 0.11
    outputs {
      controlPoints = pulse.controlPoints
    }
  }

  block "ShapeRadialPulse2D" "pulse" {
    amount = 0.35
    frequency = 5
    mix = 0.9
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 88
    thickness = 0.021
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
    radius = 0.26
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    expect(result.typedPatch.blocks.some((b) => b.type === 'ShapeRadialPulse2D')).toBe(true);
  });

  it('full compile succeeds for type-2 radial pulse pipeline', () => {
    const hcl = `
patch "Shape Radial Pulse Full Compile" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5400
    role = "timeRoot"
    outputs {
      phaseA = pulse.phase
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.15
    radiusY = 0.1
    outputs {
      controlPoints = pulse.controlPoints
    }
  }

  block "ShapeRadialPulse2D" "pulse" {
    amount = 0.34
    frequency = 6
    mix = 0.92
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 92
    thickness = 0.024
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 20
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.33
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    expectFullCompileOk(hcl);
  });
});

describe('ShapeOrbitShift2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ShapeOrbitShift2D')).toBeDefined();
  });

  it('frontend compiles polygon -> orbit shift -> parametric pipeline', () => {
    const hcl = `
patch "Test Shape Orbit Shift 2D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5600
    role = "timeRoot"
    outputs {
      phaseA = orbit.phase
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.16
    radiusY = 0.11
    outputs {
      controlPoints = orbit.controlPoints
    }
  }

  block "ShapeOrbitShift2D" "orbit" {
    orbitTurns = 6
    radius = 0.035
    mix = 0.85
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 90
    thickness = 0.022
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
    expect(result.typedPatch.blocks.some((b) => b.type === 'ShapeOrbitShift2D')).toBe(true);
  });

  it('full compile succeeds for type-2 orbit shift pipeline', () => {
    const hcl = `
patch "Shape Orbit Shift Full Compile" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5600
    role = "timeRoot"
    outputs {
      phaseA = orbit.phase
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.16
    radiusY = 0.11
    outputs {
      controlPoints = orbit.controlPoints
    }
  }

  block "ShapeOrbitShift2D" "orbit" {
    orbitTurns = 6
    radius = 0.035
    mix = 0.85
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 90
    thickness = 0.022
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
    radius = 0.3
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    expectFullCompileOk(hcl);
  });
});

describe('ShapeSquishWave2D block', () => {
  it('is registered', () => {
    expect(getBlockDefinition('ShapeSquishWave2D')).toBeDefined();
  });

  it('frontend compiles polygon -> squish wave -> parametric pipeline', () => {
    const hcl = `
patch "Test Shape Squish Wave 2D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5900
    role = "timeRoot"
    outputs {
      phaseA = squish.phase
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.18
    radiusY = 0.1
    outputs {
      controlPoints = squish.controlPoints
    }
  }

  block "ShapeSquishWave2D" "squish" {
    amount = 0.45
    frequency = 6.8
    mix = 0.9
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 96
    thickness = 0.023
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 18
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.31
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    expect(result.typedPatch.blocks.some((b) => b.type === 'ShapeSquishWave2D')).toBe(true);
  });

  it('full compile succeeds for type-2 squish wave pipeline', () => {
    const hcl = `
patch "Shape Squish Wave Full Compile" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5900
    role = "timeRoot"
    outputs {
      phaseA = squish.phase
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.18
    radiusY = 0.1
    outputs {
      controlPoints = squish.controlPoints
    }
  }

  block "ShapeSquishWave2D" "squish" {
    amount = 0.45
    frequency = 6.8
    mix = 0.9
    outputs {
      points = curve.controlPoints
    }
  }

  block "ParametricCurve2D" "curve" {
    resolution = 96
    thickness = 0.023
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 18
    outputs {
      elements = layout.elements
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.31
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    expectFullCompileOk(hcl);
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
