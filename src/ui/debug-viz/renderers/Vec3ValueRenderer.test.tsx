import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { vec3ValueRenderer } from './Vec3ValueRenderer';
import type { RendererSample, AggregateStats, Stride } from '../types';

function vec3Scalar(x: number, y: number, z: number): RendererSample {
  return { type: 'scalar', components: new Float32Array([x, y, z]), stride: 3 as Stride };
}

function vec3Aggregate(
  min: [number, number, number],
  mean: [number, number, number],
  max: [number, number, number],
  count: number,
): RendererSample {
  return {
    type: 'aggregate',
    stats: {
      count,
      stride: 3 as Stride,
      min: new Float32Array([...min, 0]),
      max: new Float32Array([...max, 0]),
      mean: new Float32Array([...mean, 0]),
    },
  };
}

describe('Vec3ValueRenderer', () => {
  describe('scalar mode', () => {
    it('renders X, Y, Z components + magnitude', () => {
      const el = vec3ValueRenderer.renderFull(vec3Scalar(1, 2, 3));
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('x');
      expect(text).toContain('y');
      expect(text).toContain('z');
      expect(text).toContain('magnitude');
      // magnitude of (1,2,3) = sqrt(14) ≈ 3.742
      expect(text).toContain('3.742');
    });

    it('handles NaN/Inf values', () => {
      const el = vec3ValueRenderer.renderFull(vec3Scalar(NaN, Infinity, -Infinity));
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('INVALID');
      expect(text).toContain('NaN');
      expect(text).toContain('+Inf');
      expect(text).toContain('-Inf');
    });
  });

  describe('aggregate mode', () => {
    it('z-uniform: shows XY scatter and "z (uniform)" label', () => {
      // Z is uniform at 5.0 across all instances
      const el = vec3ValueRenderer.renderFull(
        vec3Aggregate([0, 0, 5], [2.5, 2.5, 5], [5, 5, 5], 100),
      );
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('z (uniform)');
      expect(text).toContain('5.000');
      // Should have SVG scatter diagram
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('z-varying: shows all 3 component stat rows + magnitude', () => {
      const el = vec3ValueRenderer.renderFull(
        vec3Aggregate([0, 0, 0], [1, 2, 3], [5, 5, 5], 50),
      );
      const { container } = render(el);
      const text = container.textContent!;
      // Z varies (min=0, max=5), so full 3D stats
      expect(text).toContain('X min');
      expect(text).toContain('Y min');
      expect(text).toContain('Z min');
      expect(text).toContain('Z max');
      expect(text).toContain('avg magnitude');
      // Should NOT have scatter diagram
      expect(container.querySelector('svg')).toBeFalsy();
    });

    it('shows count badge', () => {
      const el = vec3ValueRenderer.renderFull(
        vec3Aggregate([0, 0, 0], [1, 1, 1], [2, 2, 2], 42),
      );
      const { container } = render(el);
      expect(container.textContent).toContain('N=42');
    });
  });

  describe('inline mode', () => {
    it('scalar: shows (x, y, z) format', () => {
      const el = vec3ValueRenderer.renderInline(vec3Scalar(1, 2, 3));
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('(');
      expect(text).toContain('1.000');
      expect(text).toContain('2.000');
      expect(text).toContain('3.000');
      expect(text).toContain(')');
    });

    it('aggregate: shows mean values in compact format', () => {
      const el = vec3ValueRenderer.renderInline(
        vec3Aggregate([0, 0, 0], [1.5, 2.5, 3.5], [5, 5, 5], 10),
      );
      const { container } = render(el);
      const text = container.textContent!;
      expect(text).toContain('1.500');
      expect(text).toContain('2.500');
      expect(text).toContain('3.500');
    });
  });
});
