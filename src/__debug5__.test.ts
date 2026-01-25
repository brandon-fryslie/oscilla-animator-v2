import { buildPatch } from './graph/Patch';
import './blocks/time-blocks';
import './blocks/field-operations-blocks';
import './blocks/signal-blocks';
import './blocks/primitive-blocks';
import './blocks/array-blocks';
import './blocks/field-blocks';
import './blocks/render-blocks';
import './blocks/color-blocks';
import './blocks/instance-blocks';
import './blocks/adapter-blocks';
import { compile } from './compiler/compile';
import { describe, it, expect } from 'vitest';

describe('Debug5', () => {
  it('reproduces the steel-thread-rect minimal case', () => {
    // Minimal reproduction from steel-thread-rect.test.ts
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 3000, periodBMS: 6000 });
      const rect = b.addBlock('Rect', {});
      const array = b.addBlock('Array', { count: 50 });
      b.wire(rect, 'shape', array, 'element');

      // Position: just use constant position for now
      const centerX = b.addBlock('Const', { value: 0.5 });
      const centerY = b.addBlock('Const', { value: 0.5 });
      const radius = b.addBlock('Const', { value: 0.35 });

      const goldenAngle = b.addBlock('GoldenAngle', { turns: 50 });
      const effectiveRadius = b.addBlock('RadiusSqrt', {});
      const pos = b.addBlock('PolarToCartesian', {});

      b.wire(array, 't', goldenAngle, 'id01');
      b.wire(array, 't', effectiveRadius, 'id01');
      b.wire(centerX, 'out', pos, 'centerX');
      b.wire(centerY, 'out', pos, 'centerY');
      b.wire(radius, 'out', effectiveRadius, 'radius');
      b.wire(goldenAngle, 'angle', pos, 'angle');
      b.wire(effectiveRadius, 'out', pos, 'radius');

      // Color
      const hue = b.addBlock('HueFromPhase', {});
      b.wire(time, 'phaseA', hue, 'phase');
      b.wire(array, 't', hue, 'id01');

      const sat = b.addBlock('Const', { value: 0.9 });
      const val = b.addBlock('Const', { value: 1.0 });
      const color = b.addBlock('HsvToRgb', {});
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');

      // Render
      const render = b.addBlock('RenderInstances2D', {});
      b.wire(pos, 'pos', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(rect, 'shape', render, 'shape');
    });

    const result = compile(patch);
    if (result.kind !== 'ok') {
      console.error('Compile errors:', result.errors);
    }
    expect(result.kind).toBe('ok');
  });
});
