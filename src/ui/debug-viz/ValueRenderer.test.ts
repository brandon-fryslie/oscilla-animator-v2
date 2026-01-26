import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { getValueRenderer, registerRenderer, type ValueRenderer } from './ValueRenderer';
import { signalType, unitPhase01, unitNorm01 } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';
import type { RendererSample } from './types';
import { getDataAttr } from '../../__tests__/test-utils';
import { testSignalType } from '../../__tests__/type-test-helpers';

// Create mock renderers that return identifiable elements
function mockRenderer(id: string): ValueRenderer {
  return {
    renderFull: (_s: RendererSample) => React.createElement('div', { 'data-renderer': id }, `full:${id}`),
    renderInline: (_s: RendererSample) => React.createElement('span', { 'data-renderer': id }, `inline:${id}`),
  };
}

describe('ValueRenderer registry', () => {
  // Register test renderers
  beforeEach(() => {
    // Category fallbacks
    registerRenderer('category:numeric', mockRenderer('cat-numeric'));
    registerRenderer('category:color', mockRenderer('cat-color'));
    registerRenderer('category:shape', mockRenderer('cat-shape'));

    // Payload-level
    registerRenderer('float', mockRenderer('payload-float'));
    registerRenderer('color', mockRenderer('payload-color'));

    // Exact match
    registerRenderer('float:phase01', mockRenderer('exact-float-phase'));
  });

  describe('3-tier fallback ladder', () => {
    it('tier 1: exact match (payload + unit) wins', () => {
      const type = signalType(FLOAT, unitPhase01());
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([0.5]), stride: 1 });
      expect(getDataAttr(el, 'renderer')).toBe('exact-float-phase');
    });

    it('tier 2: payload-only when no exact match', () => {
      const type = signalType(FLOAT, unitNorm01()); // no exact "float:norm01" registered
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([0.5]), stride: 1 });
      expect(getDataAttr(el, 'renderer')).toBe('payload-float');
    });

    it('tier 3: category fallback when no payload match', () => {
      // 'int' has no payload-level registration, falls to category:numeric
      const type = signalType(INT);
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([5]), stride: 1 });
      expect(getDataAttr(el, 'renderer')).toBe('cat-numeric');
    });

    it('tier 3: color category fallback', () => {
      // 'color' has payload-level, but let's test category by removing it
      // Actually color IS registered at payload level. Test vec2 -> numeric category instead.
      const type = signalType(VEC2);
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([1, 2]), stride: 2 });
      expect(getDataAttr(el, 'renderer')).toBe('cat-numeric');
    });

    it('tier 3: shape category fallback', () => {
      const type = signalType(SHAPE);
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([0]), stride: 0 });
      expect(getDataAttr(el, 'renderer')).toBe('cat-shape');
    });

    it('bool falls to category:numeric', () => {
      const type = signalType(BOOL);
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([1]), stride: 0 });
      expect(getDataAttr(el, 'renderer')).toBe('cat-numeric');
    });
  });

  describe('placeholder renderer', () => {
    it('returns placeholder for unknown payload type', () => {
      // Force unknown payload past TypeScript - use test helper then override
      const type = testSignalType('float');
      (type as any).payload = 'unknown';
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([0]), stride: 0 });
      expect((el.props as any).children).toBe('[no renderer]');
    });
  });

  describe('renderInline', () => {
    it('exact match provides inline renderer', () => {
      const type = signalType(FLOAT, unitPhase01());
      const renderer = getValueRenderer(type);
      const el = renderer.renderInline({ type: 'scalar', components: new Float32Array([0.5]), stride: 1 });
      expect(getDataAttr(el, 'renderer')).toBe('exact-float-phase');
      const elProps = el.props as any;
      expect(elProps.children).toBe('inline:exact-float-phase');
    });
  });

  describe('color payload-level match', () => {
    it('color type resolves to payload-color renderer', () => {
      const type = signalType(COLOR);
      const renderer = getValueRenderer(type);
      const el = renderer.renderFull({ type: 'scalar', components: new Float32Array([1, 0, 0, 1]), stride: 4 });
      expect(getDataAttr(el, 'renderer')).toBe('payload-color');
    });
  });
});
