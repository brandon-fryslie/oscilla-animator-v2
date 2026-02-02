/**
 * Token Expression Editor
 *
 * A contentEditable-based expression editor where block.port references
 * render as atomic chips.
 *
 * Architecture:
 * - Store expression as plain text in state
 * - Render as rich HTML: parse with tokenizeExpression(), render references as chips
 * - On input: serialize contentEditable back to plain text
 * - Chips are contenteditable="false" so they behave as atomic units
 *
 * Integrates with existing autocomplete infrastructure from BlockInspector.
 */

import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { AddressRegistry } from '../../graph/address-registry';
import { tokenizeExpression } from './referenceTokenizer';
import type { Patch } from '../../graph/Patch';
import type { BlockId } from '../../types';
import { colors } from '../theme';
import './TokenExpressionEditor.css';

// =============================================================================
// Component Props
// =============================================================================

export interface TokenExpressionEditorProps {
  /** The block owning this expression */
  readonly blockId: BlockId;

  /** Expression text (plain string) */
  readonly value: string;

  /** Patch for building AddressRegistry */
  readonly patch: Patch;

  /** Called when expression changes */
  readonly onChange: (newValue: string) => void;

  /** Called on blur */
  readonly onBlur: () => void;

  /** Maximum character length */
  readonly maxLength?: number;

  /** Placeholder text */
  readonly placeholder?: string;

  /** Whether to show error styling */
  readonly hasError?: boolean;

  /** Ref to the contentEditable div (for autocomplete positioning) */
  readonly editorRef?: React.RefObject<HTMLDivElement>;

  /** Callback for input events (for autocomplete) */
  readonly onInput?: (e: React.FormEvent<HTMLDivElement>) => void;

  /** Callback for keydown events (for autocomplete) */
  readonly onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

// =============================================================================
// Helper: Serialize contentEditable to plain text
// =============================================================================

/**
 * Extract plain text from contentEditable innerHTML.
 *
 * Reads text from each child node:
 * - Reference chips: read data-ref attribute
 * - Text nodes: read textContent
 *
 * @param element - contentEditable div element
 * @returns Plain expression text
 */
function serializeToPlainText(element: HTMLDivElement): string {
  const parts: string[] = [];

  // Iterate over child nodes
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Plain text node
      parts.push(node.textContent || '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList.contains('expr-ref-chip')) {
        // Reference chip - read data-ref attribute
        const refText = elem.getAttribute('data-ref');
        if (refText) {
          parts.push(refText);
        }
      } else {
        // Other element - read textContent
        parts.push(elem.textContent || '');
      }
    }
  });

  return parts.join('');
}

// =============================================================================
// Helper: Get cursor offset in contentEditable
// =============================================================================

/**
 * Get character offset of cursor in contentEditable.
 *
 * Used for autocomplete positioning and context detection.
 *
 * @param element - contentEditable div
 * @returns Character offset (0-based)
 */
function getCursorOffset(element: HTMLDivElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);

  // Serialize range to plain text and measure length
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(preCaretRange.cloneContents());
  return serializeToPlainText(tempDiv).length;
}

/**
 * Set cursor offset in contentEditable.
 *
 * Used to restore cursor position after suggestion insertion.
 *
 * @param element - contentEditable div
 * @param offset - Character offset (0-based)
 */
function setCursorOffset(element: HTMLDivElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  let currentOffset = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;

  // Walk through nodes to find target position
  const walk = (node: Node) => {
    if (currentOffset >= offset) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent?.length || 0;
      if (currentOffset + textLength >= offset) {
        targetNode = node;
        targetOffset = offset - currentOffset;
        currentOffset = offset;
      } else {
        currentOffset += textLength;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList.contains('expr-ref-chip')) {
        const refText = elem.getAttribute('data-ref');
        const refLength = refText?.length || 0;
        if (currentOffset + refLength >= offset) {
          // Cursor lands inside chip - snap to end of chip
          targetNode = elem;
          targetOffset = 1; // After chip
          currentOffset = offset;
        } else {
          currentOffset += refLength;
        }
      } else {
        // Recurse into children
        node.childNodes.forEach(walk);
      }
    }
  };

  element.childNodes.forEach(walk);

  if (targetNode) {
    const range = document.createRange();
    range.setStart(targetNode, targetOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * TokenExpressionEditor - contentEditable editor with reference chips.
 *
 * Features:
 * - Renders block.port references as atomic chips
 * - Connected refs: teal chips
 * - Unconnected refs: yellow chips
 * - Integrates with autocomplete dropdown
 * - Preserves plain text state
 */
export const TokenExpressionEditor: React.FC<TokenExpressionEditorProps> = ({
  blockId,
  value,
  patch,
  onChange,
  onBlur,
  maxLength = 500,
  placeholder = 'e.g., sin(in0 * 2) + 0.5',
  hasError = false,
  editorRef: externalRef,
  onInput: externalOnInput,
  onKeyDown: externalOnKeyDown,
}) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const editorRef = externalRef || internalRef;
  const [localValue, setLocalValue] = useState(value);
  const suppressNextInput = useRef(false);

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Build AddressRegistry from patch
  const addressRegistry = useMemo(() => {
    return AddressRegistry.buildFromPatch(patch);
  }, [patch]);

  // Build set of connected shorthands (for styling chips)
  const connectedShorthands = useMemo(() => {
    const set = new Set<string>();
    const block = patch.blocks.get(blockId);
    if (!block) return set;

    const refsPort = block.inputPorts.get('refs');
    if (!refsPort?.varargConnections) return set;

    // For each vararg connection, extract shorthand from sourceAddress
    for (const conn of refsPort.varargConnections) {
      // conn.sourceAddress is like "v1:blocks.circle_1.outputs.radius"
      const match = conn.sourceAddress.match(/blocks\.([^.]+)\.outputs\.([^.]+)/);
      if (match) {
        const [, blockName, portName] = match;
        set.add(`${blockName}.${portName}`);
      }
    }

    return set;
  }, [patch, blockId]);

  // Tokenize expression
  const segments = useMemo(() => {
    return tokenizeExpression(localValue, addressRegistry, connectedShorthands);
  }, [localValue, addressRegistry, connectedShorthands]);

  // Handle input (user typing/editing)
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (suppressNextInput.current) {
      suppressNextInput.current = false;
      return;
    }

    const div = e.currentTarget;
    const plainText = serializeToPlainText(div);

    if (plainText.length > maxLength) {
      // Prevent exceeding max length (revert)
      e.preventDefault();
      return;
    }

    setLocalValue(plainText);

    // Call external onInput for autocomplete
    if (externalOnInput) {
      externalOnInput(e);
    }
  }, [maxLength, externalOnInput]);

  // Handle blur
  const handleBlur = useCallback(() => {
    if (editorRef.current) {
      const finalValue = serializeToPlainText(editorRef.current);
      if (finalValue !== value) {
        onChange(finalValue);
      }
    }
    onBlur();
  }, [editorRef, value, onChange, onBlur]);

  // Handle keydown
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (externalOnKeyDown) {
      externalOnKeyDown(e);
    }
  }, [externalOnKeyDown]);

  // Render editor HTML
  const renderEditorHTML = useCallback(() => {
    return segments.map((segment, index) => {
      if (segment.isReference) {
        // Render as chip
        const chipClass = segment.isConnected
          ? 'expr-ref-chip expr-ref-chip--valid'
          : 'expr-ref-chip expr-ref-chip--error';

        return (
          <span
            key={`ref-${index}`}
            className={chipClass}
            contentEditable={false}
            data-ref={segment.text}
          >
            {segment.text}
          </span>
        );
      } else {
        // Render as plain text
        return segment.text;
      }
    });
  }, [segments]);

  // Update editor innerHTML when segments change
  useEffect(() => {
    if (!editorRef.current) return;

    const div = editorRef.current;
    const currentPlainText = serializeToPlainText(div);

    // Only update if the plain text differs (avoid unnecessary re-renders)
    if (currentPlainText !== localValue) {
      // Save cursor position
      const cursorOffset = getCursorOffset(div);

      // Update innerHTML
      suppressNextInput.current = true;
      div.innerHTML = '';
      const elements = renderEditorHTML();
      elements.forEach(el => {
        if (typeof el === 'string') {
          div.appendChild(document.createTextNode(el));
        } else {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = el.props.children;
          const span = document.createElement('span');
          span.className = el.props.className;
          span.contentEditable = 'false';
          span.setAttribute('data-ref', el.props['data-ref']);
          span.textContent = el.props.children;
          div.appendChild(span);
        }
      });

      // Restore cursor position
      setCursorOffset(div, cursorOffset);
    }
  }, [localValue, renderEditorHTML, editorRef]);

  // Empty placeholder rendering
  const showPlaceholder = localValue.length === 0;

  return (
    <div
      ref={editorRef}
      className={`token-expr-editor ${hasError ? 'token-expr-editor--error' : ''}`}
      contentEditable
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      suppressContentEditableWarning
      data-placeholder={showPlaceholder ? placeholder : undefined}
    />
  );
};
