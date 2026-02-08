import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';
import type { HistoryView, Stride } from '../types';
import { createMockCanvas2DContext } from '../../../__tests__/test-utils';

/**
 * Create a mock HistoryView from an array of values.
 * Simulates a ring buffer that has been filled with the given samples.
 */
function makeHistory(values: number[], capacity = 128): HistoryView {
  const buffer = new Float32Array(capacity);
  const count = Math.min(values.length, capacity);
  for (let i = 0; i < count; i++) {
    buffer[i % capacity] = values[i];
  }
  return {
    buffer,
    writeIndex: values.length,
    capacity,
    stride: 1 as Stride,
    filled: values.length >= capacity,
  };
}

/** Create an empty history (no samples written). */
function emptyHistory(): HistoryView {
  return {
    buffer: new Float32Array(128),
    writeIndex: 0,
    capacity: 128,
    stride: 1 as Stride,
    filled: false,
  };
}

// Mock canvas context
let mockCtx: CanvasRenderingContext2D;
let drawCalls: string[];

beforeEach(() => {
  drawCalls = [];
  mockCtx = createMockCanvas2DContext();

  // Override specific methods to track calls
  const origClearRect = mockCtx.clearRect;
  mockCtx.clearRect = vi.fn((): void => {
    drawCalls.push('clearRect');
    (origClearRect as any)();
  });

  const origBeginPath = mockCtx.beginPath;
  mockCtx.beginPath = vi.fn((): void => {
    drawCalls.push('beginPath');
    (origBeginPath as any)();
  });

  mockCtx.moveTo = vi.fn<(x: number, y: number) => void>();
  const moveToImpl = mockCtx.moveTo;
  mockCtx.moveTo = vi.fn((x: number, y: number) => {
    drawCalls.push(`moveTo(${x.toFixed(1)},${y.toFixed(1)})`);
    moveToImpl.call(mockCtx, x, y);
  });

  mockCtx.lineTo = vi.fn<(x: number, y: number) => void>();
  const lineToImpl = mockCtx.lineTo;
  mockCtx.lineTo = vi.fn((x: number, y: number) => {
    drawCalls.push(`lineTo(${x.toFixed(1)},${y.toFixed(1)})`);
    lineToImpl.call(mockCtx, x, y);
  });

  const origStroke = mockCtx.stroke;
  mockCtx.stroke = vi.fn((): void => {
    drawCalls.push('stroke');
    (origStroke as any)();
  });

  mockCtx.fillText = vi.fn<(text: string, x?: number, y?: number) => void>();
  const fillTextImpl = mockCtx.fillText;
  mockCtx.fillText = vi.fn((text: string, x?: number, y?: number) => {
    drawCalls.push(`fillText(${text})`);
    fillTextImpl.call(mockCtx, text, x ?? 0, y ?? 0);
  });

  // Mock HTMLCanvasElement.getContext to return mock context for any contextId
  HTMLCanvasElement.prototype.getContext = vi.fn(
    (_contextId: string) => mockCtx
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('Sparkline', () => {
  it('renders a canvas element', () => {
    const history = makeHistory([0.5, 0.6, 0.7]);
    const { container } = render(
      React.createElement(Sparkline, { history, width: 100, height: 30 })
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas?.style.width).toBe('100px');
    expect(canvas?.style.height).toBe('30px');
  });

  it('renders empty canvas for empty history', () => {
    const history = emptyHistory();
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
    // clearRect is called, but no stroke/line calls
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.stroke).not.toHaveBeenCalled();
  });

  it('draws line path for valid samples', () => {
    const history = makeHistory([0, 0.5, 1.0]);
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.moveTo).toHaveBeenCalled();
    expect(mockCtx.lineTo).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  it('auto-scale maps min to bottom and max to top', () => {
    // Values 0 and 1: min=0, max=1
    // Y is inverted: max (1.0) should map to y=0, min (0.0) to y=height*dpr
    const history = makeHistory([0, 1]);
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));

    // moveTo should be called for first point (value=0 → y=height*dpr)
    // lineTo for second point (value=1 → y=0)
    const moveToMock = mockCtx.moveTo as any;
    const lineToMock = mockCtx.lineTo as any;
    const moveCall = moveToMock.mock?.calls[0];
    const lineCall = lineToMock.mock?.calls[0];
    // First point (0) should be at bottom (y ≈ height*dpr)
    expect(moveCall?.[1]).toBeCloseTo(30 * (window.devicePixelRatio || 1), 0);
    // Second point (1) should be at top (y ≈ 0)
    expect(lineCall?.[1]).toBeCloseTo(0, 0);
  });

  it('flat-line does not produce division by zero', () => {
    // All same value — should render centered horizontal line
    const history = makeHistory([0.5, 0.5, 0.5, 0.5]);
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
    // Should not throw; moveTo/lineTo should still be called
    expect(mockCtx.moveTo).toHaveBeenCalled();
    expect(mockCtx.lineTo).toHaveBeenCalled();
  });

  it('flat-line renders at center height', () => {
    const history = makeHistory([0.5, 0.5]);
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
    // With flat-line handling (range=0, yMin=val-0.5, yMax=val+0.5),
    // the value 0.5 maps to center: (0.5 - 0) / 1.0 = 0.5 → y = h/2
    const dpr = window.devicePixelRatio || 1;
    const moveToMock = mockCtx.moveTo as any;
    const moveCall = moveToMock.mock?.calls[0];
    expect(moveCall?.[1]).toBeCloseTo(30 * dpr / 2, 0);
  });

  it('gaps NaN values in line path', () => {
    const history = makeHistory([0, 0.5, NaN, 0.8, 1.0]);
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
    // Should have two separate path segments (moveTo called twice)
    expect(mockCtx.moveTo).toHaveBeenCalledTimes(2);
  });

  it('shows invalid indicator when NaN present', () => {
    const history = makeHistory([0, NaN, 1]);
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
    // fillText with "!" should be called
    const fillTextMock = mockCtx.fillText as any;
    const fillTextCalls = (fillTextMock.mock?.calls ?? []).map((c: any[]) => c[0]);
    expect(fillTextCalls).toContain('!');
  });

  it('shows "invalid" text when all values are NaN/Inf', () => {
    const history = makeHistory([NaN, Infinity, -Infinity]);
    render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
    const fillTextMock = mockCtx.fillText as any;
    const fillTextCalls = (fillTextMock.mock?.calls ?? []).map((c: any[]) => c[0]);
    expect(fillTextCalls).toContain('invalid');
  });

  describe('phase wrap markers', () => {
    it('draws wrap markers for phase01 unit', () => {
      // Simulate phase wrap: 0.95 → 0.05
      const history = makeHistory([0.9, 0.95, 0.05, 0.1]);
      render(React.createElement(Sparkline, { history, width: 100, height: 30, unit: { kind: 'angle', unit: 'turns' } }));
      // setLineDash should be called for dotted lines
      expect(mockCtx.setLineDash).toHaveBeenCalled();
      // Additional vertical line drawn at wrap point
      const strokeMock = mockCtx.stroke as any;
      const strokeCalls = (strokeMock.mock?.calls ?? []).length;
      expect(strokeCalls).toBeGreaterThan(1); // main line + wrap marker
    });

    it('does NOT draw wrap markers for non-phase units', () => {
      const history = makeHistory([0.9, 0.95, 0.05, 0.1]);
      render(React.createElement(Sparkline, { history, width: 100, height: 30, unit: { kind: 'none' } }));
      // setLineDash should not be called (no wrap markers)
      expect(mockCtx.setLineDash).not.toHaveBeenCalled();
    });

    it('does NOT draw wrap markers when unit is undefined', () => {
      const history = makeHistory([0.9, 0.95, 0.05, 0.1]);
      render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
      expect(mockCtx.setLineDash).not.toHaveBeenCalled();
    });
  });

  describe('scale markers', () => {
    it('displays min and max labels', () => {
      const history = makeHistory([0, 100]);
      render(React.createElement(Sparkline, { history, width: 100, height: 30 }));
      const fillTextCalls = (mockCtx.fillText as any).mock.calls.map((c: any[]) => c[0]);
      // Should contain scale labels for 0 and 100
      expect(fillTextCalls.some((t: string) => t.includes('0'))).toBe(true);
      expect(fillTextCalls.some((t: string) => t.includes('100'))).toBe(true);
    });
  });
});
