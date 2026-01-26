/**
 * Cursor Position Calculation for Autocomplete
 *
 * Measures the pixel position of the text cursor within a textarea.
 * Uses the "measurement div" technique to accurately calculate position.
 *
 * Algorithm:
 * 1. Create an invisible div with same styling as textarea
 * 2. Copy text up to cursor position
 * 3. Measure the div's dimensions
 * 4. Calculate position relative to viewport
 */

// =============================================================================
// Types
// =============================================================================

export interface CursorPosition {
  /** Y coordinate (pixels from top of viewport) */
  readonly top: number;

  /** X coordinate (pixels from left of viewport) */
  readonly left: number;
}

// =============================================================================
// Cursor Position Calculation
// =============================================================================

/**
 * Get the pixel position of the text cursor in a textarea.
 *
 * Uses a measurement div technique:
 * - Creates a temporary div with identical styling
 * - Copies text content up to cursor position
 * - Measures the div to get cursor pixel coordinates
 * - Accounts for textarea scroll position and viewport position
 *
 * @param textarea - The textarea element
 * @param cursorOffset - Character offset of cursor (from textarea.selectionStart)
 * @returns Cursor position in viewport coordinates
 *
 * @example
 * ```typescript
 * const textarea = document.getElementById('expr-input') as HTMLTextAreaElement;
 * const pos = getCursorPosition(textarea, textarea.selectionStart);
 * console.log(`Cursor at (${pos.left}, ${pos.top})`);
 * ```
 */
export function getCursorPosition(
  textarea: HTMLTextAreaElement,
  cursorOffset: number
): CursorPosition {
  // Create measurement div
  const measurer = document.createElement('div');
  const computedStyle = window.getComputedStyle(textarea);

  // Copy textarea styles to measurer
  measurer.style.position = 'absolute';
  measurer.style.visibility = 'hidden';
  measurer.style.whiteSpace = 'pre-wrap';
  measurer.style.wordWrap = 'break-word';
  measurer.style.width = computedStyle.width;
  measurer.style.font = computedStyle.font;
  measurer.style.fontSize = computedStyle.fontSize;
  measurer.style.fontFamily = computedStyle.fontFamily;
  measurer.style.fontWeight = computedStyle.fontWeight;
  measurer.style.lineHeight = computedStyle.lineHeight;
  measurer.style.letterSpacing = computedStyle.letterSpacing;
  measurer.style.padding = computedStyle.padding;
  measurer.style.border = computedStyle.border;
  measurer.style.boxSizing = computedStyle.boxSizing;

  // Copy text up to cursor
  const textBeforeCursor = textarea.value.substring(0, cursorOffset);
  measurer.textContent = textBeforeCursor;

  // Add cursor marker (span at end of text)
  const cursorMarker = document.createElement('span');
  cursorMarker.textContent = '|';
  measurer.appendChild(cursorMarker);

  // Add to DOM temporarily
  document.body.appendChild(measurer);

  // Measure cursor marker position
  const markerRect = cursorMarker.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();

  // Clean up
  document.body.removeChild(measurer);

  // Calculate position relative to textarea
  const relativeTop = markerRect.top - textareaRect.top;
  const relativeLeft = markerRect.left - textareaRect.left;

  // Account for textarea scroll
  const scrollTop = textarea.scrollTop;
  const scrollLeft = textarea.scrollLeft;

  // Final position in viewport coordinates
  return {
    top: textareaRect.top + relativeTop - scrollTop + 20, // +20 to position below cursor
    left: textareaRect.left + relativeLeft - scrollLeft,
  };
}

/**
 * Adjust dropdown position to stay within viewport bounds.
 *
 * If the dropdown would overflow the viewport, it's repositioned:
 * - Horizontally: shift left to fit
 * - Vertically: flip above cursor if near bottom
 *
 * @param position - Initial dropdown position
 * @param dropdownHeight - Height of dropdown (estimated or measured)
 * @param dropdownWidth - Width of dropdown
 * @returns Adjusted position that fits within viewport
 */
export function adjustPositionForViewport(
  position: CursorPosition,
  dropdownHeight: number,
  dropdownWidth: number
): CursorPosition {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let { top, left } = position;

  // Adjust horizontal position
  if (left + dropdownWidth > viewport.width) {
    left = Math.max(0, viewport.width - dropdownWidth - 10);
  }

  // Adjust vertical position
  if (top + dropdownHeight > viewport.height) {
    // Flip above cursor (subtract dropdown height + extra spacing)
    top = Math.max(0, top - dropdownHeight - 40);
  }

  return { top, left };
}
