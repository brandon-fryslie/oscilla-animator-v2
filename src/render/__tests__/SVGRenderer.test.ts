import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pathToSvgD, SVGRenderer } from '../svg/SVGRenderer';
import type { RenderFrameIR, DrawPathInstancesOp } from '../types';

describe('SVGRenderer', () => {
  describe('pathToSvgD', () => {
    it('converts MOVE and LINE to M and L commands', () => {
      const verbs = new Uint8Array([0, 1, 1, 1, 4]); // MOVE, LINE, LINE, LINE, CLOSE
      const points = new Float32Array([
        0, -1,  // top
        1, 0,   // right
        0, 1,   // bottom
        -1, 0,  // left
      ]);

      const d = pathToSvgD(verbs, points, 4);

      expect(d).toBe('M 0 -1 L 1 0 L 0 1 L -1 0 Z');
    });

    it('converts CUBIC to C command', () => {
      const verbs = new Uint8Array([0, 2]); // MOVE, CUBIC
      const points = new Float32Array([
        0, 0,     // start
        0.5, 0,   // cp1
        0.5, 1,   // cp2
        1, 1,     // end
      ]);

      const d = pathToSvgD(verbs, points, 4);

      expect(d).toBe('M 0 0 C 0.5 0 0.5 1 1 1');
    });

    it('converts QUAD to Q command', () => {
      const verbs = new Uint8Array([0, 3]); // MOVE, QUAD
      const points = new Float32Array([
        0, 0,   // start
        0.5, 1, // control
        1, 0,   // end
      ]);

      const d = pathToSvgD(verbs, points, 3);

      expect(d).toBe('M 0 0 Q 0.5 1 1 0');
    });

    it('handles CLOSE verb', () => {
      const verbs = new Uint8Array([0, 1, 4]); // MOVE, LINE, CLOSE
      const points = new Float32Array([0, 0, 1, 1]);

      const d = pathToSvgD(verbs, points, 2);

      expect(d).toBe('M 0 0 L 1 1 Z');
    });

    it('throws on unknown verb', () => {
      const verbs = new Uint8Array([0, 99]); // MOVE, unknown
      const points = new Float32Array([0, 0]);

      expect(() => pathToSvgD(verbs, points, 1)).toThrow('Unknown path verb: 99');
    });
  });

  describe('SVGRenderer class', () => {
    let container: HTMLElement;
    let renderer: SVGRenderer;

    beforeEach(() => {
      // Create a mock container
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      renderer?.dispose();
      document.body.removeChild(container);
    });

    function createTriangleOp(): DrawPathInstancesOp {
      return {
        kind: 'drawPathInstances',
        geometry: {
          topologyId: 1,
          verbs: new Uint8Array([0, 1, 1, 4]), // triangle
          points: new Float32Array([0, -1, 1, 1, -1, 1]),
          pointsCount: 3,
        },
        instances: {
          count: 2,
          position: new Float32Array([0.25, 0.5, 0.75, 0.5]),
          size: 0.1,
          rotation: new Float32Array([0, 0]),
          scale2: new Float32Array([1, 1, 1, 1]),
        },
        style: {
          fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
        },
      };
    }

    it('creates SVG element in container', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('width')).toBe('800');
      expect(svg?.getAttribute('height')).toBe('600');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 800 600');
    });

    it('creates defs element for geometry templates', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const defs = container.querySelector('defs');
      expect(defs).toBeTruthy();
    });

    it('renders DrawPathInstancesOp with <use> elements', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const frame: RenderFrameIR = {
        version: 2,
        ops: [createTriangleOp()],
      };

      renderer.render(frame);

      // Should have geometry def and use elements
      const paths = container.querySelectorAll('defs path');
      expect(paths.length).toBe(1);

      const uses = container.querySelectorAll('use');
      expect(uses.length).toBe(2); // 2 instances
    });

    it('applies fill color to use elements', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const op = createTriangleOp();
      const frame: RenderFrameIR = {
        version: 2,
        ops: [op],
      };

      renderer.render(frame);

      const uses = container.querySelectorAll('use');
      expect(uses[0].getAttribute('fill')).toBe('rgba(255,0,0,1)');
    });

    it('applies per-instance fill colors', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const op = createTriangleOp();
      const frame: RenderFrameIR = {
        version: 2,
        ops: [{
          ...op,
          style: {
            ...op.style,
            fillColor: new Uint8ClampedArray([
              255, 0, 0, 255,   // red
              0, 255, 0, 255,   // green
            ]),
          },
        }],
      };

      renderer.render(frame);

      const uses = container.querySelectorAll('use');
      expect(uses[0].getAttribute('fill')).toBe('rgba(255,0,0,1)');
      expect(uses[1].getAttribute('fill')).toBe('rgba(0,255,0,1)');
    });

    it('applies stroke when strokeColor present', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const op = createTriangleOp();
      const frame: RenderFrameIR = {
        version: 2,
        ops: [{
          ...op,
          style: {
            ...op.style,
            strokeColor: new Uint8ClampedArray([0, 0, 255, 255]),
            strokeWidth: 0.01,
          },
        }],
      };

      renderer.render(frame);

      const uses = container.querySelectorAll('use');
      expect(uses[0].getAttribute('stroke')).toBe('rgba(0,0,255,1)');
      expect(uses[0].hasAttribute('stroke-width')).toBe(true);
    });

    it('clears render group between frames', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const frame: RenderFrameIR = {
        version: 2,
        ops: [createTriangleOp()],
      };

      renderer.render(frame);
      expect(container.querySelectorAll('use').length).toBe(2);

      renderer.render(frame);
      expect(container.querySelectorAll('use').length).toBe(2); // Still 2, not 4
    });

    it('exports SVG as string', () => {
      renderer = new SVGRenderer(container, 800, 600);

      const frame: RenderFrameIR = {
        version: 2,
        ops: [createTriangleOp()],
      };

      renderer.render(frame);

      const svgString = renderer.toSVGString();
      expect(svgString).toContain('<svg');
      expect(svgString).toContain('<defs>');
      expect(svgString).toContain('<use');
    });

    it('disposes and removes SVG from container', () => {
      renderer = new SVGRenderer(container, 800, 600);
      expect(container.querySelector('svg')).toBeTruthy();

      renderer.dispose();
      expect(container.querySelector('svg')).toBeNull();
    });

    it('resizes viewport', () => {
      renderer = new SVGRenderer(container, 800, 600);
      renderer.resize(1920, 1080);

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('1920');
      expect(svg?.getAttribute('height')).toBe('1080');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 1920 1080');
    });
  });
});
