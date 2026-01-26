/**
 * Tests for cursor position calculation utilities
 *
 * NOTE: These tests run in jsdom, which does not compute layout.
 * getBoundingClientRect() returns all zeros in jsdom.
 *
 * Tests focus on:
 * - Algorithm correctness (measurer div creation, cleanup)
 * - adjustPositionForViewport logic (no layout dependency)
 * - Integration behavior (returns valid objects)
 *
 * Visual verification must be done in a real browser.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCursorPosition, adjustPositionForViewport } from '../cursorPosition';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a test textarea element with specified dimensions and content.
 */
function createTestTextarea(options: {
  width?: number;
  height?: number;
  value?: string;
  fontSize?: string;
}): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');

  // Set styles
  textarea.style.width = `${options.width ?? 300}px`;
  textarea.style.height = `${options.height ?? 100}px`;
  textarea.style.fontSize = options.fontSize ?? '14px';
  textarea.style.fontFamily = 'monospace';
  textarea.style.lineHeight = '1.5';
  textarea.style.padding = '8px';
  textarea.style.position = 'absolute';
  textarea.style.top = '100px';
  textarea.style.left = '100px';

  // Set content
  textarea.value = options.value ?? '';

  // Add to DOM
  document.body.appendChild(textarea);

  return textarea;
}

/**
 * Remove textarea from DOM.
 */
function cleanupTextarea(textarea: HTMLTextAreaElement): void {
  if (textarea.parentNode) {
    document.body.removeChild(textarea);
  }
}

// =============================================================================
// getCursorPosition Tests (Algorithm & Structure)
// =============================================================================

describe('getCursorPosition - Algorithm', () => {
  let textarea: HTMLTextAreaElement;

  afterEach(() => {
    if (textarea) {
      cleanupTextarea(textarea);
    }
  });

  it('returns a CursorPosition object with top and left properties', () => {
    textarea = createTestTextarea({ value: 'hello world' });

    const position = getCursorPosition(textarea, 0);

    expect(position).toHaveProperty('top');
    expect(position).toHaveProperty('left');
    expect(typeof position.top).toBe('number');
    expect(typeof position.left).toBe('number');
  });

  it('handles empty textarea without errors', () => {
    textarea = createTestTextarea({ value: '' });

    expect(() => {
      getCursorPosition(textarea, 0);
    }).not.toThrow();
  });

  it('handles cursor at various positions without errors', () => {
    textarea = createTestTextarea({ value: 'hello world' });

    expect(() => getCursorPosition(textarea, 0)).not.toThrow();
    expect(() => getCursorPosition(textarea, 5)).not.toThrow();
    expect(() => getCursorPosition(textarea, 11)).not.toThrow();
  });

  it('handles multiline text without errors', () => {
    textarea = createTestTextarea({ value: 'line1\nline2\nline3' });

    expect(() => getCursorPosition(textarea, 0)).not.toThrow();
    expect(() => getCursorPosition(textarea, 6)).not.toThrow();
    expect(() => getCursorPosition(textarea, 12)).not.toThrow();
  });

  it('handles cursor at newline character', () => {
    textarea = createTestTextarea({ value: 'line1\nline2' });

    expect(() => getCursorPosition(textarea, 5)).not.toThrow(); // at \n
    expect(() => getCursorPosition(textarea, 6)).not.toThrow(); // after \n
  });

  it('returns consistent results for same cursor position', () => {
    textarea = createTestTextarea({ value: 'test text' });

    const pos1 = getCursorPosition(textarea, 4);
    const pos2 = getCursorPosition(textarea, 4);

    expect(pos1.top).toBe(pos2.top);
    expect(pos1.left).toBe(pos2.left);
  });

  it('cleans up measurement div after calculation', () => {
    textarea = createTestTextarea({ value: 'test' });

    const beforeCount = document.body.children.length;
    getCursorPosition(textarea, 2);
    const afterCount = document.body.children.length;

    expect(afterCount).toBe(beforeCount);
  });
});

// =============================================================================
// adjustPositionForViewport Tests (Pure Logic)
// =============================================================================

describe('adjustPositionForViewport', () => {
  // Mock viewport dimensions
  const mockViewport = {
    width: 1024,
    height: 768,
  };

  beforeEach(() => {
    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: mockViewport.width,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: mockViewport.height,
    });
  });

  it('does not adjust position when dropdown fits within viewport', () => {
    const position = { top: 100, left: 100 };
    const adjusted = adjustPositionForViewport(position, 200, 300);

    expect(adjusted.top).toBe(100);
    expect(adjusted.left).toBe(100);
  });

  it('adjusts horizontal position when dropdown overflows right edge', () => {
    const position = { top: 100, left: 900 }; // Would overflow with 300px width
    const adjusted = adjustPositionForViewport(position, 200, 300);

    // Should be shifted left to fit
    expect(adjusted.left).toBeLessThan(position.left);
    expect(adjusted.left + 300).toBeLessThanOrEqual(mockViewport.width + 10); // +10 for margin
  });

  it('adjusts vertical position when dropdown overflows bottom edge', () => {
    const position = { top: 700, left: 100 }; // Would overflow with 200px height
    const adjusted = adjustPositionForViewport(position, 200, 300);

    // Should be flipped above cursor
    expect(adjusted.top).toBeLessThan(position.top);
  });

  it('adjusts both dimensions when dropdown overflows both edges', () => {
    const position = { top: 700, left: 900 };
    const adjusted = adjustPositionForViewport(position, 200, 300);

    expect(adjusted.top).toBeLessThan(position.top);
    expect(adjusted.left).toBeLessThan(position.left);
  });

  it('clamps left position to minimum 0', () => {
    const position = { top: 100, left: 5 }; // Very near left edge
    const adjusted = adjustPositionForViewport(position, 200, 1000); // Very wide dropdown

    expect(adjusted.left).toBeGreaterThanOrEqual(0);
  });

  it('clamps top position to minimum 0 when flipped', () => {
    const position = { top: 50, left: 100 }; // Very near top
    const adjusted = adjustPositionForViewport(position, 200, 300);

    // If flipped, should clamp to 0
    expect(adjusted.top).toBeGreaterThanOrEqual(0);
  });

  it('handles edge case of dropdown larger than viewport', () => {
    const position = { top: 100, left: 100 };
    const adjusted = adjustPositionForViewport(position, 1000, 1500);

    // Should still return valid positions (clamped)
    expect(adjusted.top).toBeGreaterThanOrEqual(0);
    expect(adjusted.left).toBeGreaterThanOrEqual(0);
  });

  it('provides margin from viewport edges', () => {
    const position = { top: 100, left: mockViewport.width - 290 };
    const adjusted = adjustPositionForViewport(position, 200, 300);

    // Should have margin from right edge
    expect(adjusted.left + 300).toBeLessThan(mockViewport.width + 15); // Some margin
  });

  it('handles position at origin', () => {
    const position = { top: 0, left: 0 };
    const adjusted = adjustPositionForViewport(position, 200, 300);

    expect(adjusted.top).toBeGreaterThanOrEqual(0);
    expect(adjusted.left).toBeGreaterThanOrEqual(0);
  });

  it('handles position at viewport edges', () => {
    const position = { top: mockViewport.height, left: mockViewport.width };
    const adjusted = adjustPositionForViewport(position, 200, 300);

    // Should adjust to fit within viewport
    expect(adjusted.top).toBeLessThan(mockViewport.height);
    expect(adjusted.left).toBeLessThan(mockViewport.width);
  });
});

// =============================================================================
// Integration Tests (Combined Behavior)
// =============================================================================

describe('cursorPosition - Integration', () => {
  let textarea: HTMLTextAreaElement;

  afterEach(() => {
    if (textarea) {
      cleanupTextarea(textarea);
    }
  });

  it('calculates position and adjusts for viewport', () => {
    textarea = createTestTextarea({
      value: 'sin(x) + cos(y)',
      width: 300,
    });

    // Get cursor position at offset 7 (after "sin(x) ")
    const cursorPos = getCursorPosition(textarea, 7);

    // Adjust for viewport
    const adjusted = adjustPositionForViewport(cursorPos, 400, 300);

    // Should be valid viewport coordinates
    expect(adjusted).toHaveProperty('top');
    expect(adjusted).toHaveProperty('left');
    expect(typeof adjusted.top).toBe('number');
    expect(typeof adjusted.left).toBe('number');
  });

  it('handles full workflow without errors', () => {
    textarea = createTestTextarea({
      value: 'lerp(a, b, t)',
      width: 400,
    });

    expect(() => {
      const pos = getCursorPosition(textarea, 5);
      adjustPositionForViewport(pos, 400, 300);
    }).not.toThrow();
  });

  it('produces stable results for repeated calculations', () => {
    textarea = createTestTextarea({
      value: 'test expression',
      width: 300,
    });

    const pos1 = getCursorPosition(textarea, 5);
    const adjusted1 = adjustPositionForViewport(pos1, 400, 300);

    const pos2 = getCursorPosition(textarea, 5);
    const adjusted2 = adjustPositionForViewport(pos2, 400, 300);

    expect(adjusted1.top).toBe(adjusted2.top);
    expect(adjusted1.left).toBe(adjusted2.left);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('cursorPosition - Edge Cases', () => {
  let textarea: HTMLTextAreaElement;

  afterEach(() => {
    if (textarea) {
      cleanupTextarea(textarea);
    }
  });

  it('handles very long single-line text', () => {
    const longText = 'a'.repeat(1000);
    textarea = createTestTextarea({ value: longText, width: 300 });

    expect(() => {
      getCursorPosition(textarea, 500);
    }).not.toThrow();
  });

  it('handles text with many newlines', () => {
    const manyLines = 'line\n'.repeat(100);
    textarea = createTestTextarea({ value: manyLines, width: 300 });

    expect(() => {
      getCursorPosition(textarea, 250);
    }).not.toThrow();
  });

  it('handles cursor beyond text length (clamped by substring)', () => {
    textarea = createTestTextarea({ value: 'short', width: 300 });

    expect(() => {
      getCursorPosition(textarea, 1000);
    }).not.toThrow();
  });

  it('handles special characters in text', () => {
    textarea = createTestTextarea({ value: 'a + b * (c / d)', width: 300 });

    expect(() => {
      getCursorPosition(textarea, 7);
    }).not.toThrow();
  });

  it('handles unicode characters', () => {
    textarea = createTestTextarea({ value: '你好世界 🌍', width: 300 });

    expect(() => {
      getCursorPosition(textarea, 3);
    }).not.toThrow();
  });
});
