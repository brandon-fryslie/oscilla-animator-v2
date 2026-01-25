/**
 * Shared Test Utilities
 *
 * Common helpers and mocks used across test files to reduce boilerplate
 * and eliminate unsafe type assertions.
 */

import { vi } from 'vitest';
import type { ReactElement } from 'react';

/**
 * Type-safe accessor for data attributes on React elements.
 *
 * Safely retrieves data-* attributes from React element props without
 * requiring 'as any' casts.
 *
 * @param element - The React element to read from
 * @param attrName - The data attribute name (without 'data-' prefix)
 * @returns The attribute value, or undefined if not present
 *
 * @example
 * const el = React.createElement('div', { 'data-renderer': 'test' });
 * getDataAttr(el, 'renderer') // 'test'
 */
export function getDataAttr(
  element: ReactElement,
  attrName: string
): string | undefined {
  return (element.props as Record<string, unknown>)[`data-${attrName}`] as
    | string
    | undefined;
}

/**
 * Creates a properly-typed mock CanvasRenderingContext2D for testing.
 *
 * Returns a mock canvas context with vi.fn() for all methods, allowing
 * verification of canvas operations without requiring 'as any' casts.
 *
 * All methods and properties used in our tests are included. Extend this
 * as needed when new canvas operations are tested.
 *
 * @returns A mock CanvasRenderingContext2D that can be used with vi assertions
 *
 * @example
 * const mockCtx = createMockCanvas2DContext();
 * HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx);
 * // Now tests can verify canvas operations:
 * expect(mockCtx.fill).toHaveBeenCalled();
 */
export function createMockCanvas2DContext(): CanvasRenderingContext2D {
  return {
    // Path drawing methods
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),

    // Fill and stroke
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),

    // Rectangles
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),

    // Text
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 } as TextMetrics)),

    // Transformations
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),

    // State management
    save: vi.fn(),
    restore: vi.fn(),

    // Line styles
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),

    // Image drawing
    drawImage: vi.fn(),

    // Pixel manipulation
    createImageData: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),

    // Canvas state
    canvas: {
      width: 800,
      height: 600,
    } as HTMLCanvasElement,

    // Properties (with defaults that can be overridden)
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDashOffset: 0,
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    filter: 'none',

    // Additional methods to satisfy CanvasRenderingContext2D interface
    createLinearGradient: vi.fn(),
    createRadialGradient: vi.fn(),
    createPattern: vi.fn(),
    createConicGradient: vi.fn(),
    isPointInPath: vi.fn(),
    isPointInStroke: vi.fn(),
    getContextAttributes: vi.fn(),
    getTransform: vi.fn(),
    roundRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
