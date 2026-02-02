/**
 * ContentEditable Cursor Utilities
 *
 * Utilities for getting and setting cursor position in contentEditable elements.
 * Provides a textarea-compatible API for use with autocomplete system.
 */

/**
 * Get character offset of cursor in contentEditable element.
 *
 * Returns the cursor position as a character offset from the start of the text,
 * compatible with textarea.selectionStart.
 *
 * @param element - contentEditable div element
 * @returns Character offset (0-based), or 0 if no selection
 */
export function getContentEditableCursorOffset(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);

  // Get plain text length (accounting for reference chips)
  return getPlainTextLength(preCaretRange.cloneContents());
}

/**
 * Set cursor position in contentEditable element by character offset.
 *
 * @param element - contentEditable div element
 * @param offset - Character offset (0-based)
 */
export function setContentEditableCursorOffset(element: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  let currentOffset = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;

  // Walk through nodes to find target position
  const walk = (node: Node): boolean => {
    if (currentOffset >= offset) return true; // Found it

    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent?.length || 0;
      if (currentOffset + textLength >= offset) {
        targetNode = node;
        targetOffset = offset - currentOffset;
        currentOffset = offset;
        return true;
      } else {
        currentOffset += textLength;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList.contains('expr-ref-chip')) {
        // Reference chip - count as length of data-ref attribute
        const refText = elem.getAttribute('data-ref');
        const refLength = refText?.length || 0;
        if (currentOffset + refLength >= offset) {
          // Cursor lands inside chip - snap to end of chip
          targetNode = node.parentNode;
          targetOffset = Array.from(node.parentNode?.childNodes || []).indexOf(node) + 1;
          currentOffset = offset;
          return true;
        } else {
          currentOffset += refLength;
        }
      } else {
        // Recurse into children
        for (const child of Array.from(node.childNodes)) {
          if (walk(child)) return true;
        }
      }
    }
    return false;
  };

  for (const child of Array.from(element.childNodes)) {
    if (walk(child)) break;
  }

  if (targetNode) {
    const range = document.createRange();
    range.setStart(targetNode, targetOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Get plain text length of a document fragment, accounting for reference chips.
 *
 * @param fragment - Document fragment or element
 * @returns Plain text character count
 */
function getPlainTextLength(fragment: DocumentFragment | Element): number {
  let length = 0;

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      length += node.textContent?.length || 0;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList?.contains('expr-ref-chip')) {
        // Reference chip - count as length of data-ref
        const refText = elem.getAttribute('data-ref');
        length += refText?.length || 0;
      } else {
        // Recurse into children
        elem.childNodes.forEach(walk);
      }
    }
  };

  fragment.childNodes.forEach(walk);
  return length;
}

/**
 * Get the plain text content from a contentEditable element.
 *
 * Similar to textarea.value, but for contentEditable.
 * Serializes chips to their text representation.
 *
 * @param element - contentEditable div element
 * @returns Plain text content
 */
export function getContentEditableTextValue(element: HTMLElement): string {
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList.contains('expr-ref-chip')) {
        const refText = elem.getAttribute('data-ref');
        if (refText) {
          parts.push(refText);
        }
      } else {
        elem.childNodes.forEach(walk);
      }
    }
  };

  element.childNodes.forEach(walk);
  return parts.join('');
}
