import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { vec4ValueRenderer } from './Vec4ValueRenderer';
import type { RendererSample, AggregateStats, Stride } from '../types';

function vec4Scalar(x: number, y: number, z: number, w: number): RendererSample {
  return { type: 'scalar', components: new Float32Array([x, y, z, w]), stride: 4 as Stride };
}

function vec4Aggregate(
  min: [number, number, number, number],
  mean: [number, number, number, number],
  max: [number, number, number, number],
  count: number,
): RendererSample {
  return {
    type: 'aggregate',
    stats: {
      count,
      stride: 4 as Stride,
      min: new Float32Array(min),
      max: new Float32Array(max),
      mean: new Float32Array(mean),
    },
  };
}

describe('Vec4ValueRenderer', () => {
  describe('scalar mode', () => {
    it('renders X, Y, Z, W components + magnitude', () => {
      const el = vec4ValueRenderer.renderFull(vec4Scalar(1, 2, 3, 4));
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('x');
      expect(text).toContain('y');
      expect(text).toContain('z');
      expect(text).toContain('w');
      expect(text).toContain('magnitude');
      // magnitude of (1,2,3,4) = sqrt(30) ≈ 5.477
      expect(text).toContain('5.477');
    });

    it('handles invalid values', () => {
      const el = vec4ValueRenderer.renderFull(vec4Scalar(NaN, 0, Infinity, -Infinity));
      const { container } = render(el);
      expect(container.textContent).toContain('INVALID');
    });
  });

  describe('aggregate mode', () => {
    it('shows per-component stats for all 4 components', () => {
      const el = vec4ValueRenderer.renderFull(
        vec4Aggregate([0, 0, 0, 0], [1, 2, 3, 4], [5, 5, 5, 5], 20),
      );
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('X min');
      expect(text).toContain('Y mean');
      expect(text).toContain('Z max');
      expect(text).toContain('W min');
      expect(text).toContain('avg magnitude');
    });

    it('shows count badge', () => {
      const el = vec4ValueRenderer.renderFull(
        vec4Aggregate([0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2], 99),
      );
      const { container } = render(el);
      expect(container.textContent).toContain('N=99');
    });
  });

  describe('inline mode', () => {
    it('shows (x, y, z, w) format', () => {
      const el = vec4ValueRenderer.renderInline(vec4Scalar(1, 2, 3, 4));
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('(');
      expect(text).toContain('1.000');
      expect(text).toContain('4.000');
      expect(text).toContain(')');
    });
  });
});
