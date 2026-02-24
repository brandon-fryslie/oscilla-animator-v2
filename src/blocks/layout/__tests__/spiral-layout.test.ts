import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import '../../all';
import { getBlockDefinition } from '../../registry';

describe('SpiralLayout', () => {
  it('is registered', () => {
    expect(getBlockDefinition('SpiralLayout')).toBeDefined();
  });

  it('frontend compiles with basic wiring', () => {
    const hcl = `
patch "Test Spiral Layout" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "Ellipse" "dot" {
    outputs { shape = arr.element }
  }

  block "Array" "arr" {
    count = 100
    outputs { elements = spiral.elements }
  }

  block "SpiralLayout" "spiral" {
    turns = 3
    expansion = 0.3
  }
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const spiralBlock = result.typedPatch.blocks.find(b => b.type === 'SpiralLayout');
    expect(spiralBlock).toBeDefined();
    expect(spiralBlock!.outputPorts.size).toBeGreaterThan(0);
  });

  it('compiles full pipeline with MakeShape2D stamp', () => {
    const hcl = `
patch "Test MakeShape2D + SpiralLayout" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "ProceduralPolygon" "polygon" {
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
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 50
    outputs {
      elements = spiral.elements
      t = color.h
    }
  }

  block "SpiralLayout" "spiral" {
    turns = 3
    expansion = 0.3
    outputs {
      position = render.pos
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const spiralBlock = result.typedPatch.blocks.find(b => b.type === 'SpiralLayout');
    expect(spiralBlock).toBeDefined();
    const renderBlock = result.typedPatch.blocks.find(b => b.type === 'RenderInstances2D');
    expect(renderBlock).toBeDefined();
  });
});
