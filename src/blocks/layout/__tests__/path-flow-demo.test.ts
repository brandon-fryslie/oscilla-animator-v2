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
      phaseA = path-layout.offset
    }
  }

  block "ProceduralPolygon" "polygon" {
    sides = 5
    radiusX = 0.2
    radiusY = 0.2
    outputs {
      controlPoints = assembler.controlPoints
      shape = path-layout.shape
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
      elements = path-layout.elements
      t = color.h
    }
  }

  block "PathLayout" "path-layout" {
    outputs {
      controlPoints = center-path.refs
    }
  }

  block "Expression" "center-path" {
    expression = <<-EXPR
      x = path_layout.controlPoints.x + 0.5
      y = path_layout.controlPoints.y + 0.5
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "MakeColorOKLCH" "color" {
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
    expect(blockTypes).toContain('Expression');
    expect(blockTypes).toContain('ProceduralPolygon');
    expect(blockTypes).toContain('RenderInstances2D');
  });

  it('PathLayout has controlPoints and rotation outputs', () => {
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);

    const pathLayoutIndex = result.typedPatch.blocks.findIndex(b => b.type === 'PathLayout');
    expect(pathLayoutIndex).toBeGreaterThanOrEqual(0);
    const pathLayoutOutputs = Array.from(result.typedPatch.portTypes.keys())
      .filter(key => key.startsWith(`${pathLayoutIndex}:`) && key.endsWith(':out')).length;
    expect(pathLayoutOutputs).toBeGreaterThanOrEqual(2);
  });

  it('Expression block is present for viewport recentering', () => {
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);

    const expressionIndex = result.typedPatch.blocks.findIndex(b => b.type === 'Expression');
    expect(expressionIndex).toBeGreaterThanOrEqual(0);
  });
});
