import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { createFloatValueRenderer, floatValueRenderer } from './FloatValueRenderer';
import type { RendererSample, AggregateStats, Stride } from '../types';

function scalarSample(value: number): RendererSample {
  return { type: 'scalar', components: new Float32Array([value]), stride: 1 };
}

function aggregateSample(min: number, mean: number, max: number, count: number): RendererSample {
  const stats: AggregateStats = {
    count,
    stride: 1 as Stride,
    min: new Float32Array([min, 0, 0, 0]),
    max: new Float32Array([max, 0, 0, 0]),
    mean: new Float32Array([mean, 0, 0, 0]),
  };
  return { type: 'aggregate', stats };
}

describe('FloatValueRenderer', () => {
  describe('scalar mode', () => {
    it('displays formatted value', () => {
      const el = floatValueRenderer.renderFull(scalarSample(3.14159));
      const { container } = render(el);
      expect(container.textContent).toContain('3.142');
    });

    it('displays NaN as red badge', () => {
      const el = floatValueRenderer.renderFull(scalarSample(NaN));
      const { container } = render(el);
      expect(container.textContent).toContain('NaN');
      // Check for red color styling
      const badge = container.querySelector('span[style*="color"]');
      expect(badge).toBeTruthy();
    });

    it('displays Inf as badge', () => {
      const el = floatValueRenderer.renderFull(scalarSample(Infinity));
      const { container } = render(el);
      expect(container.textContent).toContain('+Inf');
    });
  });

  describe('unit decorations', () => {
    // Note: After ValueContract migration, contract information (clamp01, wrap01)
    // is not available in FloatRendererProps (only has UnitType, not CanonicalType).
    // Range validation tests removed as they require contract info.

    it('phase01: shows "phase" label', () => {
      const renderer = createFloatValueRenderer({ kind: 'angle', unit: 'turns' });
      const el = renderer.renderFull(scalarSample(0.75));
      const { container } = render(el);
      expect(container.textContent).toContain('phase');
    });

    it('scalar: no decoration', () => {
      const el = floatValueRenderer.renderFull(scalarSample(42));
      const { container } = render(el);
      expect(container.textContent).toBe('42.00');
    });

    it('radians: shows "rad" label', () => {
      const renderer = createFloatValueRenderer({ kind: 'angle', unit: 'radians' });
      const el = renderer.renderFull(scalarSample(3.14159));
      const { container } = render(el);
      expect(container.textContent).toContain('rad');
    });

    it('ms: shows "ms" label', () => {
      const renderer = createFloatValueRenderer({ kind: 'time', unit: 'ms' });
      const el = renderer.renderFull(scalarSample(16.67));
      const { container } = render(el);
      expect(container.textContent).toContain('ms');
    });

    it('degrees: shows "deg" label', () => {
      const renderer = createFloatValueRenderer({ kind: 'angle', unit: 'degrees' });
      const el = renderer.renderFull(scalarSample(180));
      const { container } = render(el);
      expect(container.textContent).toContain('deg');
    });
  });

  describe('aggregate mode', () => {
    it('shows min/mean/max with count', () => {
      const el = floatValueRenderer.renderFull(aggregateSample(0.1, 0.5, 0.9, 64));
      const { container } = render(el);
      expect(container.textContent).toContain('Min');
      expect(container.textContent).toContain('Mean');
      expect(container.textContent).toContain('Max');
      expect(container.textContent).toContain('64 instances');
    });
  });

  describe('inline mode', () => {
    it('scalar: compact formatted value', () => {
      const el = floatValueRenderer.renderInline(scalarSample(0.5));
      const { container } = render(el);
      expect(container.textContent).toBe('0.5000');
    });

    it('scalar with unit: shows label', () => {
      const renderer = createFloatValueRenderer({ kind: 'angle', unit: 'turns' });
      const el = renderer.renderInline(scalarSample(0.25));
      const { container } = render(el);
      expect(container.textContent).toBe('0.2500 phase');
    });

    it('aggregate: shows mean with count', () => {
      const el = floatValueRenderer.renderInline(aggregateSample(0, 0.5, 1.0, 100));
      const { container } = render(el);
      expect(container.textContent).toBe('0.5000 (n=100)');
    });
  });
});
