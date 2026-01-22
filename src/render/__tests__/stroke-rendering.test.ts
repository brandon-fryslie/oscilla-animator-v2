import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateStrokeWidthPx,
  renderDrawPathInstancesOp,
} from '../Canvas2DRenderer';
import type { DrawPathInstancesOp } from '../future-types';

describe('Stroke Rendering', () => {
  describe('calculateStrokeWidthPx', () => {
    it('scales stroke width by min dimension', () => {
      // 0.01 world units on 1000x500 viewport → 5px (min=500)
      expect(calculateStrokeWidthPx(0.01, 1000, 500)).toBe(5);
    });

    it('uses height when shorter than width', () => {
      expect(calculateStrokeWidthPx(0.1, 1920, 1080)).toBe(108);
    });

    it('uses width when shorter than height', () => {
      expect(calculateStrokeWidthPx(0.1, 800, 1200)).toBe(80);
    });

    it('handles square viewports', () => {
      expect(calculateStrokeWidthPx(0.05, 800, 800)).toBe(40);
    });

    it('handles zero stroke width', () => {
      expect(calculateStrokeWidthPx(0, 1000, 1000)).toBe(0);
    });
  });

  describe('renderDrawPathInstancesOp', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      // Create a mock canvas context
      ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        lineJoin: 'miter',
        lineCap: 'butt',
        lineWidth: 1,
        lineDashOffset: 0,
        fillStyle: '',
        strokeStyle: '',
      } as unknown as CanvasRenderingContext2D;
    });

    function createSquareOp(style: Partial<DrawPathInstancesOp['style']>): DrawPathInstancesOp {
      return {
        kind: 'drawPathInstances',
        geometry: {
          topologyId: 1,
          verbs: new Uint8Array([0, 1, 1, 1, 4]), // square: MOVE, LINE, LINE, LINE, CLOSE
          points: new Float32Array([
            -1, -1,  // top-left
            1, -1,   // top-right
            1, 1,    // bottom-right
            -1, 1,   // bottom-left
          ]),
          pointsCount: 4,
        },
        instances: {
          count: 1,
          position: new Float32Array([0.5, 0.5]),
          size: 0.1,
        },
        style: {
          fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
          ...style,
        },
      };
    }

    it('renders fill-only when no strokeColor', () => {
      const op = createSquareOp({});

      renderDrawPathInstancesOp(ctx, op, 800, 600);

      expect(ctx.fill).toHaveBeenCalledTimes(1);
      expect(ctx.stroke).not.toHaveBeenCalled();
    });

    it('renders stroke-only when no fillColor', () => {
      const op = createSquareOp({
        fillColor: undefined,
        strokeColor: new Uint8ClampedArray([0, 255, 0, 255]),
        strokeWidth: 0.01,
      });

      renderDrawPathInstancesOp(ctx, op, 800, 600);

      expect(ctx.stroke).toHaveBeenCalledTimes(1);
      expect(ctx.fill).not.toHaveBeenCalled();
    });

    it('renders fill then stroke when both present', () => {
      const op = createSquareOp({
        strokeColor: new Uint8ClampedArray([0, 0, 255, 255]),
        strokeWidth: 0.02,
      });

      const calls: string[] = [];
      (ctx.fill as any).mockImplementation(() => calls.push('fill'));
      (ctx.stroke as any).mockImplementation(() => calls.push('stroke'));

      renderDrawPathInstancesOp(ctx, op, 800, 600);

      expect(calls).toEqual(['fill', 'stroke']);
    });

    it('applies lineJoin and lineCap when stroking', () => {
      const op = createSquareOp({
        strokeColor: new Uint8ClampedArray([0, 255, 0, 255]),
        strokeWidth: 0.01,
        lineJoin: 'round',
        lineCap: 'square',
      });

      renderDrawPathInstancesOp(ctx, op, 800, 600);

      expect(ctx.lineJoin).toBe('round');
      expect(ctx.lineCap).toBe('square');
    });

    it('applies dash pattern scaled to pixels', () => {
      const op = createSquareOp({
        strokeColor: new Uint8ClampedArray([0, 255, 0, 255]),
        strokeWidth: 0.01,
        dashPattern: [0.01, 0.005], // world units
      });

      renderDrawPathInstancesOp(ctx, op, 1000, 600);

      // D = min(1000, 600) = 600
      // dash = [0.01 * 600, 0.005 * 600] = [6, 3]
      expect(ctx.setLineDash).toHaveBeenCalledWith([6, 3]);
    });

    it('sets dash offset scaled to pixels', () => {
      const op = createSquareOp({
        strokeColor: new Uint8ClampedArray([0, 255, 0, 255]),
        strokeWidth: 0.01,
        dashPattern: [0.01, 0.01],
        dashOffset: 0.005,
      });

      renderDrawPathInstancesOp(ctx, op, 1000, 600);

      // D = 600, offset = 0.005 * 600 = 3
      expect(ctx.lineDashOffset).toBe(3);
    });

    it('resets dash pattern after rendering', () => {
      const op = createSquareOp({
        strokeColor: new Uint8ClampedArray([0, 255, 0, 255]),
        strokeWidth: 0.01,
        dashPattern: [0.01, 0.01],
      });

      renderDrawPathInstancesOp(ctx, op, 800, 600);

      // Last setLineDash call should be empty array (reset)
      const calls = (ctx.setLineDash as any).mock.calls;
      expect(calls[calls.length - 1]).toEqual([[]]);
    });

    it('handles per-instance fill colors', () => {
      const op: DrawPathInstancesOp = {
        kind: 'drawPathInstances',
        geometry: {
          topologyId: 1,
          verbs: new Uint8Array([0, 4]),
          points: new Float32Array([0, 0]),
          pointsCount: 1,
        },
        instances: {
          count: 2,
          position: new Float32Array([0.25, 0.5, 0.75, 0.5]),
          size: 0.1,
        },
        style: {
          fillColor: new Uint8ClampedArray([
            255, 0, 0, 255,  // instance 0: red
            0, 255, 0, 255,  // instance 1: green
          ]),
        },
      };

      renderDrawPathInstancesOp(ctx, op, 800, 600);

      expect(ctx.fill).toHaveBeenCalledTimes(2);
    });

    it('handles per-instance stroke widths', () => {
      const op: DrawPathInstancesOp = {
        ...createSquareOp({
          strokeColor: new Uint8ClampedArray([0, 0, 0, 255]),
          strokeWidth: new Float32Array([0.01, 0.02]),
        }),
        instances: {
          count: 2,
          position: new Float32Array([0.25, 0.5, 0.75, 0.5]),
          size: 0.1,
        },
      };

      renderDrawPathInstancesOp(ctx, op, 1000, 600);

      expect(ctx.stroke).toHaveBeenCalledTimes(2);
    });
  });
});
