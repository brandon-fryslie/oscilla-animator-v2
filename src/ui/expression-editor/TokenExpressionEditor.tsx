/**
 * Token Expression Editor
 *
 * A contentEditable-based expression editor where block.port references
 * render as atomic chips.
 *
 * Architecture:
 * - Canonical state is plain text (localValue string)
 * - Render as rich HTML only on external prop changes or focus loss
 * - During typing, let the browser manage contentEditable naturally
 * - On blur or prop change: re-render with tokenized chips
 * - Chips are contenteditable="false" so they behave as atomic units
 */

import React, { useRef, useCallback, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { AddressRegistry } from '../../graph/address-registry';
import { tokenizeExpression } from './referenceTokenizer';
import type { Patch } from '../../graph/Patch';
import type { BlockId } from '../../types';
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

  /** Called when expression changes (on each keystroke) */
  readonly onChange: (newValue: string, cursorOffset: number) => void;

  /** Called on blur */
  readonly onBlur: () => void;

  /** Maximum character length */
  readonly maxLength?: number;

  /** Placeholder text */
  readonly placeholder?: string;

  /** Whether to show error styling */
  readonly hasError?: boolean;

  /** Callback for keydown events (for autocomplete) */
  readonly onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/** Handle exposed via ref for external control */
export interface TokenExpressionEditorHandle {
  /** Focus the editor */
  focus: () => void;
  /** Get the editor DOM element */
  getElement: () => HTMLDivElement | null;
  /** Get current cursor offset in plain text coordinates */
  getCursorOffset: () => number;
  /** Set cursor offset in plain text coordinates */
  setCursorOffset: (offset: number) => void;
  /** Force re-render with chips (e.g., after suggestion insertion) */
  refreshChips: () => void;
}

// =============================================================================
// Helper: Serialize contentEditable to plain text
// =============================================================================

function serializeToPlainText(element: HTMLDivElement): string {
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList.contains('expr-ref-chip')) {
        const refText = elem.getAttribute('data-ref');
        if (refText) parts.push(refText);
      } else if (elem.tagName === 'BR') {
        parts.push('\n');
      } else {
        elem.childNodes.forEach(walk);
      }
    }
  };

  element.childNodes.forEach(walk);
  return parts.join('');
}

// =============================================================================
// Helper: Get cursor offset in plain text coordinates
// =============================================================================

function getCursorOffsetInPlainText(element: HTMLDivElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);

  let length = 0;
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      length += node.textContent?.length || 0;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList?.contains('expr-ref-chip')) {
        const refText = elem.getAttribute('data-ref');
        length += refText?.length || 0;
      } else {
        elem.childNodes.forEach(walk);
      }
    }
  };

  const fragment = preCaretRange.cloneContents();
  fragment.childNodes.forEach(walk);
  return length;
}

// =============================================================================
// Helper: Set cursor position by plain text offset
// =============================================================================

function setCursorByPlainTextOffset(element: HTMLDivElement, targetOffset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  let currentOffset = 0;
  let targetNode: Node | null = null;
  let nodeOffset = 0;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent?.length || 0;
      if (currentOffset + textLength >= targetOffset) {
        targetNode = node;
        nodeOffset = targetOffset - currentOffset;
        return true;
      }
      currentOffset += textLength;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.classList.contains('expr-ref-chip')) {
        const refText = elem.getAttribute('data-ref');
        const refLength = refText?.length || 0;
        if (currentOffset + refLength >= targetOffset) {
          const parent = elem.parentNode;
          if (parent) {
            const childIndex = Array.from(parent.childNodes).indexOf(elem as ChildNode);
            targetNode = parent;
            nodeOffset = childIndex + 1;
            return true;
          }
        }
        currentOffset += refLength;
      } else {
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
    try {
      range.setStart(targetNode, nodeOffset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

// =============================================================================
// Helper: Build innerHTML from segments
// =============================================================================

function buildInnerHTML(
  text: string,
  addressRegistry: AddressRegistry,
  connectedShorthands: ReadonlySet<string>
): string {
  const segments = tokenizeExpression(text, addressRegistry, connectedShorthands);
  return segments
    .map(segment => {
      if (segment.isReference) {
        const chipClass = segment.isConnected
          ? 'expr-ref-chip expr-ref-chip--valid'
          : 'expr-ref-chip expr-ref-chip--error';
        const escapedRef = segment.text
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;');
        const escapedText = segment.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<span class="${chipClass}" contenteditable="false" data-ref="${escapedRef}">${escapedText}</span>`;
      } else {
        return segment.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
    })
    .join('');
}

// =============================================================================
// Component
// =============================================================================

export const TokenExpressionEditor = forwardRef<TokenExpressionEditorHandle, TokenExpressionEditorProps>(
  function TokenExpressionEditor(
    {
      blockId,
      value,
      patch,
      onChange,
      onBlur,
      maxLength = 500,
      placeholder = 'e.g., sin(circle_1.radius * 2)',
      hasError = false,
      onKeyDown: externalOnKeyDown,
    },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isUserTyping = useRef(false);
    const lastRenderedValue = useRef(value);

    // Build AddressRegistry from patch
    const addressRegistry = useMemo(() => {
      return AddressRegistry.buildFromPatch(patch);
    }, [patch]);

    // Build set of connected shorthands from collect edges targeting refs port
    // [LAW:one-type-per-behavior] Read from edges.
    const connectedShorthands = useMemo(() => {
      const set = new Set<string>();

      for (const edge of patch.edges) {
        if (edge.to.kind !== 'port') continue;
        if (edge.to.blockId !== blockId || edge.to.slotId !== 'refs') continue;
        if (edge.from.kind !== 'port') continue;

        // Build shorthand from source block ID and port
        const sourceBlock = patch.blocks.get(edge.from.blockId as import('../../types').BlockId);
        if (sourceBlock) {
          set.add(`${sourceBlock.id}.${edge.from.slotId}`);
        }
      }
      return set;
    }, [patch, blockId]);

    // Expose handle via ref
    useImperativeHandle(ref, () => ({
      focus: () => editorRef.current?.focus(),
      getElement: () => editorRef.current,
      getCursorOffset: () => {
        if (!editorRef.current) return 0;
        return getCursorOffsetInPlainText(editorRef.current);
      },
      setCursorOffset: (offset: number) => {
        if (!editorRef.current) return;
        setCursorByPlainTextOffset(editorRef.current, offset);
      },
      refreshChips: () => {
        if (!editorRef.current) return;
        const cursorOff = getCursorOffsetInPlainText(editorRef.current);
        const text = serializeToPlainText(editorRef.current);
        editorRef.current.innerHTML = buildInnerHTML(text, addressRegistry, connectedShorthands);
        lastRenderedValue.current = text;
        requestAnimationFrame(() => {
          if (editorRef.current) {
            setCursorByPlainTextOffset(editorRef.current, cursorOff);
          }
        });
      },
    }), [addressRegistry, connectedShorthands]);

    // Prop-driven updates (external value changes)
    useEffect(() => {
      if (!editorRef.current) return;
      if (isUserTyping.current) {
        isUserTyping.current = false;
        return;
      }
      if (value !== lastRenderedValue.current) {
        const cursorOff = getCursorOffsetInPlainText(editorRef.current);
        editorRef.current.innerHTML = buildInnerHTML(value, addressRegistry, connectedShorthands);
        lastRenderedValue.current = value;
        requestAnimationFrame(() => {
          if (editorRef.current) {
            setCursorByPlainTextOffset(editorRef.current, cursorOff);
          }
        });
      }
    }, [value, addressRegistry, connectedShorthands]);

    // First mount: render initial content
    useEffect(() => {
      if (editorRef.current && editorRef.current.innerHTML === '') {
        editorRef.current.innerHTML = buildInnerHTML(value, addressRegistry, connectedShorthands);
        lastRenderedValue.current = value;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handle input (user typing)
    const handleInput = useCallback(() => {
      if (!editorRef.current) return;

      const plainText = serializeToPlainText(editorRef.current);

      if (plainText.length > maxLength) {
        editorRef.current.innerHTML = buildInnerHTML(
          lastRenderedValue.current,
          addressRegistry,
          connectedShorthands
        );
        return;
      }

      isUserTyping.current = true;
      lastRenderedValue.current = plainText;
      const cursorOffset = getCursorOffsetInPlainText(editorRef.current);
      onChange(plainText, cursorOffset);
    }, [maxLength, onChange, addressRegistry, connectedShorthands]);

    // Handle blur: re-render with chips
    const handleBlur = useCallback(() => {
      if (!editorRef.current) return;

      const plainText = serializeToPlainText(editorRef.current);
      editorRef.current.innerHTML = buildInnerHTML(plainText, addressRegistry, connectedShorthands);
      lastRenderedValue.current = plainText;

      onBlur();
    }, [onBlur, addressRegistry, connectedShorthands]);

    // Handle keydown
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      if (externalOnKeyDown) {
        externalOnKeyDown(e);
      }
    }, [externalOnKeyDown]);

    // Popover state for reference chips
    const [popoverData, setPopoverData] = useState<{
      shorthand: string;
      isConnected: boolean;
      position: { top: number; left: number };
    } | null>(null);
    const popoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('expr-ref-chip')) {
        const shorthand = target.getAttribute('data-ref');
        if (!shorthand) return;

        if (popoverTimeout.current) clearTimeout(popoverTimeout.current);

        const rect = target.getBoundingClientRect();
        setPopoverData({
          shorthand,
          isConnected: target.classList.contains('expr-ref-chip--valid'),
          position: { top: rect.bottom + 4, left: rect.left },
        });
      }
    }, []);

    const handleMouseOut = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('expr-ref-chip')) {
        popoverTimeout.current = setTimeout(() => setPopoverData(null), 150);
      }
    }, []);

    // Resolve popover metadata
    const popoverContent = useMemo(() => {
      if (!popoverData) return null;
      const canonicalAddr = addressRegistry.resolveShorthand(popoverData.shorthand);
      if (!canonicalAddr || canonicalAddr.kind !== 'output') {
        return { blockType: 'Unknown', portName: popoverData.shorthand, typeDesc: 'unknown', isConnected: popoverData.isConnected };
      }

      const addrStr = `v1:blocks.${canonicalAddr.canonicalName}.outputs.${canonicalAddr.portId}`;
      const resolved = addressRegistry.resolve(addrStr);

      if (resolved?.kind === 'output') {
        const payloadStr = resolved.type.payload.kind;
        const cardAxis = resolved.type.extent.cardinality;
        let kindStr = 'Signal';
        if (cardAxis.kind === 'inst') {
          kindStr = cardAxis.value.kind === 'many' ? 'Field' : cardAxis.value.kind === 'zero' ? 'Const' : 'Signal';
        }
        return {
          blockType: resolved.block.type,
          portName: String(canonicalAddr.portId),
          typeDesc: `${kindStr}<${payloadStr}>`,
          isConnected: popoverData.isConnected,
        };
      }

      return { blockType: 'Unknown', portName: popoverData.shorthand, typeDesc: 'unknown', isConnected: popoverData.isConnected };
    }, [popoverData, addressRegistry]);

    const isEmpty = value.length === 0;

    return (
      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          className={`token-expr-editor ${hasError ? 'token-expr-editor--error' : ''} ${isEmpty ? 'token-expr-editor--empty' : ''}`}
          contentEditable
          onInput={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
          suppressContentEditableWarning
          data-placeholder={placeholder}
        />
        {popoverData && popoverContent && (
          <div
            className="expr-ref-popover"
            style={{
              position: 'fixed',
              top: `${popoverData.position.top}px`,
              left: `${popoverData.position.left}px`,
            }}
          >
            <div className="expr-ref-popover__header">
              {popoverContent.blockType} / {popoverContent.portName}
            </div>
            <div className="expr-ref-popover__type">{popoverContent.typeDesc}</div>
            <div className={`expr-ref-popover__status ${popoverContent.isConnected ? 'expr-ref-popover__status--connected' : 'expr-ref-popover__status--disconnected'}`}>
              {popoverContent.isConnected ? 'Connected' : 'Not connected'}
            </div>
          </div>
        )}
      </div>
    );
  }
);
