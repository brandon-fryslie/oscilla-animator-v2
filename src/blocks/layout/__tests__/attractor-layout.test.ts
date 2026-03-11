import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../../patch-dsl/index';
import { compileFrontend } from '../../../compiler/frontend/index';
import '../../all';
import { getBlockDefinition } from '../../registry';

describe('AttractorLayout', () => {
  it('is registered', () => {
    expect(getBlockDefinition('AttractorLayout')).toBeDefined();
  });

  it('frontend compiles with basic wiring', () => {
    const hcl = `
patch "Test Attractor Layout" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "Ellipse" "dot" {
    outputs { shape = arr.element }
  }

  block "Array" "arr" {
    count = 50
    outputs { elements = circle.elements }
  }

  block "CircleLayoutUV" "circle" {
    outputs { controlPoints = attractor.points }
  }

  block "AttractorLayout" "attractor" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const attractorIndex = result.typedPatch.blocks.findIndex(b => b.type === 'AttractorLayout');
    expect(attractorIndex).toBeGreaterThanOrEqual(0);
    const outputCount = Array.from(result.typedPatch.portTypes.keys())
      .filter(key => key.startsWith(`${attractorIndex}:`) && key.endsWith(':out')).length;
    expect(outputCount).toBeGreaterThan(0);
  });

  it('compiles full pipeline', () => {
    const hcl = `
patch "Test AttractorLayout Full" {
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
      elements = circle.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "circle" {
    outputs { controlPoints = attractor.points }
  }

  block "AttractorLayout" "attractor" {
    outputs { controlPoints = render.controlPoints }
  }

  block "MakeColorOKLCH" "color" {
    outputs { color = render.color }
  }

  block "RenderInstances2D" "render" {}
}`;
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);
    const result = compileFrontend(patch);
    const attractorBlock = result.typedPatch.blocks.find(b => b.type === 'AttractorLayout');
    expect(attractorBlock).toBeDefined();
    const renderBlock = result.typedPatch.blocks.find(b => b.type === 'RenderInstances2D');
    expect(renderBlock).toBeDefined();
  });
});
