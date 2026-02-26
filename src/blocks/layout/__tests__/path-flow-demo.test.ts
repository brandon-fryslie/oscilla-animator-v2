import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import '../../all';

describe('Path Flow demo', () => {
  const hcl = `
patch "Path Flow" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    role = "timeRoot"
    outputs {
      phaseA = pathLayout.offset
    }
  }

  block "ProceduralPolygon" "polygon" {
    sides = 5
    radiusX = 0.2
    radiusY = 0.2
    outputs {
      controlPoints = assembler.controlPoints
      shape = pathLayout.shape
    }
  }

  block "MakeShape2D" "assembler" {
    closed = true
  }

  block "Ellipse" "dot" {
    rx = 0.008
    ry = 0.008
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 40
    outputs {
      elements = pathLayout.elements
      t = color.h
    }
  }

  block "PathLayout" "pathLayout" {
    outputs {
      controlPoints = attractor.points
    }
  }

  block "AttractorLayout" "attractor" {
    strength = 0.6
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}`;

  it('parses without errors', () => {
    const { errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
  });

  it('frontend compiles all blocks', () => {
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);

    const blockTypes = result.typedPatch.blocks.map(b => b.type);
    expect(blockTypes).toContain('PathLayout');
    expect(blockTypes).toContain('AttractorLayout');
    expect(blockTypes).toContain('ProceduralPolygon');
    expect(blockTypes).toContain('RenderInstances2D');
  });

  it('PathLayout has controlPoints and rotation outputs', () => {
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);

    const pathLayout = result.typedPatch.blocks.find(b => b.type === 'PathLayout');
    expect(pathLayout).toBeDefined();
    expect(pathLayout!.outputPorts.size).toBeGreaterThanOrEqual(2);
  });

  it('AttractorLayout has controlPoints output', () => {
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);

    const attractor = result.typedPatch.blocks.find(b => b.type === 'AttractorLayout');
    expect(attractor).toBeDefined();
    expect(attractor!.outputPorts.size).toBeGreaterThanOrEqual(1);
  });
});
