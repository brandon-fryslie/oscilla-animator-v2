import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { cameraProjectionRenderer } from './CameraProjectionRenderer';
import type { RendererSample, Stride } from '../types';

function cpScalar(value: number): RendererSample {
  return { type: 'scalar', components: new Float32Array([value]), stride: 1 as Stride };
}

function cpAggregate(mean: number, count: number): RendererSample {
  return {
    type: 'aggregate',
    stats: {
      count,
      stride: 1 as Stride,
      min: new Float32Array([0, 0, 0, 0]),
      max: new Float32Array([1, 0, 0, 0]),
      mean: new Float32Array([mean, 0, 0, 0]),
    },
  };
}

describe('CameraProjectionRenderer', () => {
  describe('scalar mode', () => {
    it('shows ORTHOGRAPHIC badge for value 0', () => {
      const el = cameraProjectionRenderer.renderFull(cpScalar(0));
      const { container } = render(el);
      expect(container.textContent).toContain('ORTHOGRAPHIC');
    });

    it('shows PERSPECTIVE badge for value 1', () => {
      const el = cameraProjectionRenderer.renderFull(cpScalar(1));
      const { container } = render(el);
      expect(container.textContent).toContain('PERSPECTIVE');
    });

    it('shows raw value', () => {
      const el = cameraProjectionRenderer.renderFull(cpScalar(0.3));
      const { container } = render(el);
      expect(container.textContent).toContain('raw: 0.300');
    });
  });

  describe('aggregate mode', () => {
    it('shows percentage perspective', () => {
      const el = cameraProjectionRenderer.renderFull(cpAggregate(0.75, 100));
      const { container } = render(el);
      expect(container.textContent).toContain('75.0%');
      expect(container.textContent).toContain('perspective');
    });

    it('shows count breakdown', () => {
      const el = cameraProjectionRenderer.renderFull(cpAggregate(0.5, 40));
      const { container } = render(el);
      expect(container.textContent).toContain('Total');
      expect(container.textContent).toContain('40');
      expect(container.textContent).toContain('Perspective');
      expect(container.textContent).toContain('Orthographic');
    });
  });

  describe('inline mode', () => {
    it('shows "ortho" for orthographic', () => {
      const el = cameraProjectionRenderer.renderInline(cpScalar(0));
      const { container } = render(el);
      expect(container.textContent).toContain('ortho');
    });

    it('shows "persp" for perspective', () => {
      const el = cameraProjectionRenderer.renderInline(cpScalar(1));
      const { container } = render(el);
      expect(container.textContent).toContain('persp');
    });
  });
});
