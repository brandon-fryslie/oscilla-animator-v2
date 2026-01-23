import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { colorValueRenderer } from './ColorValueRenderer';
import type { RendererSample, AggregateStats, Stride } from '../types';

function colorAggregate(
  min: [number, number, number, number],
  mean: [number, number, number, number],
  max: [number, number, number, number],
  count: number
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

function scalarSample(): RendererSample {
  return { type: 'scalar', components: new Float32Array([1, 0, 0, 1]), stride: 4 };
}

describe('ColorValueRenderer', () => {
  describe('aggregate mode (full)', () => {
    it('renders hex display from mean color', () => {
      const sample = colorAggregate(
        [0, 0, 0, 1], // min
        [1, 0, 0, 1], // mean = pure red
        [1, 1, 1, 1], // max
        10
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      expect(container.textContent).toContain('#ff0000');
    });

    it('hex conversion correct for mid-values (0.5)', () => {
      const sample = colorAggregate(
        [0, 0, 0, 0],
        [0.5, 0.5, 0.5, 1], // mid-gray
        [1, 1, 1, 1],
        5
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      // 0.5 * 255 = 127.5 → 128 → '80'
      expect(container.textContent).toContain('#808080');
    });

    it('hex conversion correct for 0.0 (black)', () => {
      const sample = colorAggregate(
        [0, 0, 0, 0],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        1
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      expect(container.textContent).toContain('#000000');
    });

    it('hex conversion correct for 1.0 (white)', () => {
      const sample = colorAggregate(
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        1
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      expect(container.textContent).toContain('#ffffff');
    });

    it('shows alpha value', () => {
      const sample = colorAggregate(
        [0, 0, 0, 0],
        [1, 0, 0, 0.5],
        [1, 1, 1, 1],
        20
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      expect(container.textContent).toContain('α=');
      expect(container.textContent).toContain('0.5000');
    });

    it('shows count badge', () => {
      const sample = colorAggregate(
        [0, 0, 0, 0],
        [0.5, 0.5, 0.5, 1],
        [1, 1, 1, 1],
        42
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      expect(container.textContent).toContain('n=42');
    });

    it('renders color swatch with checkerboard pattern', () => {
      const sample = colorAggregate(
        [0, 0, 0, 0],
        [1, 0, 0, 0.5],
        [1, 1, 1, 1],
        10
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      // Checkerboard div should be present
      const checkerboard = container.querySelector('div[style*="conic-gradient"]');
      expect(checkerboard).toBeTruthy();
    });

    it('renders per-channel bars (R, G, B, A labels)', () => {
      const sample = colorAggregate(
        [0, 0, 0, 0],
        [0.5, 0.5, 0.5, 0.5],
        [1, 1, 1, 1],
        10
      );
      const el = colorValueRenderer.renderFull(sample);
      const { container } = render(el);
      expect(container.textContent).toContain('R');
      expect(container.textContent).toContain('G');
      expect(container.textContent).toContain('B');
      expect(container.textContent).toContain('A');
    });
  });

  describe('scalar mode', () => {
    it('falls through to generic numeric renderer', () => {
      const el = colorValueRenderer.renderFull(scalarSample());
      const { container } = render(el);
      // Generic numeric shows comma-separated or multi-component display
      // Just verify it renders without crashing
      expect(container.textContent).toBeTruthy();
    });
  });

  describe('inline mode', () => {
    it('aggregate: shows small swatch and hex', () => {
      const sample = colorAggregate(
        [0, 0, 0, 0],
        [0, 1, 0, 1], // green
        [1, 1, 1, 1],
        5
      );
      const el = colorValueRenderer.renderInline(sample);
      const { container } = render(el);
      expect(container.textContent).toContain('#00ff00');
    });

    it('scalar: falls through to generic inline', () => {
      const el = colorValueRenderer.renderInline(scalarSample());
      const { container } = render(el);
      expect(container.textContent).toBeTruthy();
    });
  });
});
