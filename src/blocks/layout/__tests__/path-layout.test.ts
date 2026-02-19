import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import '../../all';
import { getBlockDefinition } from '../../registry';

describe('PathLayout', () => {
  it('is registered', () => {
    expect(getBlockDefinition('PathLayout')).toBeDefined();
  });

  it('frontend compiles with basic wiring', () => {
    const hcl = `
patch "Test Path Layout" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "ProceduralPolygon" "polygon" {
    sides = 3
    radiusX = 0.3
    radiusY = 0.3
    outputs {
      controlPoints = assemble.controlPoints
      shape = pathLayout.shape
    }
  }

  block "MakeShape2D" "assemble" {
    closed = 1
  }

  block "Ellipse" "dot" {
    outputs { shape = arr.element }
  }

  block "Array" "arr" {
    count = 20
    outputs { elements = pathLayout.elements }
  }

  block "PathLayout" "pathLayout" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const pathLayoutBlock = result.typedPatch.blocks.find(b => b.type === 'PathLayout');
    expect(pathLayoutBlock).toBeDefined();
    expect(pathLayoutBlock!.outputPorts.size).toBeGreaterThan(0);
  });

  it('compiles full pipeline with render', () => {
    const hcl = `
patch "Test PathLayout Full Pipeline" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "ProceduralPolygon" "polygon" {
    sides = 5
    radiusX = 0.3
    radiusY = 0.3
    outputs {
      controlPoints = assemble.controlPoints
      shape = pathLayout.shape
    }
  }

  block "MakeShape2D" "assemble" {
    closed = 1
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 30
    outputs {
      elements = pathLayout.elements
      t = color.h
    }
  }

  block "PathLayout" "pathLayout" {
    outputs {
      position = render.pos
    }
  }

  block "MakeColorHSL" "color" {
    outputs { color = render.color }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const pathLayoutBlock = result.typedPatch.blocks.find(b => b.type === 'PathLayout');
    expect(pathLayoutBlock).toBeDefined();
    const renderBlock = result.typedPatch.blocks.find(b => b.type === 'RenderInstances2D');
    expect(renderBlock).toBeDefined();
  });

  it('has position and rotation outputs', () => {
    const def = getBlockDefinition('PathLayout');
    expect(def).toBeDefined();
    expect(def!.outputs.position).toBeDefined();
    expect(def!.outputs.rotation).toBeDefined();
  });
});
