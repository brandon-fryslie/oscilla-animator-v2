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
import { addressToString } from '../../types/canonical-address';
import { getOutputAddress } from '../../graph/addressing';
import { tokenizeExpression } from './referenceTokenizer';
import type { ExpressionInlineDiagnostic } from './editorAnnotations';
import type { ExpressionSyntaxSpan } from './syntaxHighlighting';
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

  /** Patch context used for suggestion/rendering lookups that must stay in sync with addressRegistry */
  readonly patch: Patch;

  /** Canonical AddressRegistry for token rendering and block.port chip resolution */
  readonly addressRegistry: AddressRegistry;

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

  /** Inline diagnostics anchored to source ranges */
  readonly diagnostics?: readonly ExpressionInlineDiagnostic[];

  /** Syntax highlighting spans for plain-text ranges */
  readonly syntaxSpans?: readonly ExpressionSyntaxSpan[];

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

function isChipElement(elem: HTMLElement): boolean {
  return elem.classList.contains('expr-ref-chip') || elem.classList.contains('expr-const-chip');
}

function isIgnoredDecorationElement(elem: HTMLElement): boolean {
  return elem.classList.contains('expr-inline-diagnostic');
}

function getChipSourceText(elem: HTMLElement): string {
  return elem.getAttribute('data-token')
    ?? elem.getAttribute('data-ref')
    ?? elem.getAttribute('data-const')
    ?? '';
}

function serializeToPlainText(element: HTMLDivElement): string {
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (isChipElement(elem)) {
        const sourceText = getChipSourceText(elem);
        if (sourceText) parts.push(sourceText);
      } else if (isIgnoredDecorationElement(elem)) {
        return;
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
      if (isChipElement(elem)) {
        length += getChipSourceText(elem).length;
      } else if (isIgnoredDecorationElement(elem)) {
        return;
      } else if (elem.tagName === 'BR') {
        length += 1;
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
      if (isChipElement(elem)) {
        const sourceLength = getChipSourceText(elem).length;
        if (currentOffset + sourceLength >= targetOffset) {
          const parent = elem.parentNode;
          if (parent) {
            const childIndex = Array.from(parent.childNodes).indexOf(elem as ChildNode);
            targetNode = parent;
            nodeOffset = childIndex + 1;
            return true;
          }
        }
        currentOffset += sourceLength;
      } else if (isIgnoredDecorationElement(elem)) {
        return false;
      } else if (elem.tagName === 'BR') {
        if (currentOffset + 1 >= targetOffset) {
          const parent = elem.parentNode;
          if (parent) {
            const childIndex = Array.from(parent.childNodes).indexOf(elem as ChildNode);
            targetNode = parent;
            nodeOffset = childIndex + 1;
            return true;
          }
        }
        currentOffset += 1;
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
  connectedAddresses: ReadonlySet<string>,
  diagnostics: readonly ExpressionInlineDiagnostic[],
  syntaxSpans: readonly ExpressionSyntaxSpan[],
): string {
  const segments = tokenizeExpression(text, addressRegistry, connectedAddresses);
  return segments
    .map(segment => {
      const segmentDiagnostics = diagnostics.filter(
        (diagnostic) => diagnostic.start < segment.end && diagnostic.end > segment.start,
      );
      const diagnosticBubbleHtml = segmentDiagnostics
        .filter((diagnostic) => diagnostic.end === segment.end)
        .map(renderInlineDiagnostic)
        .join('');

      if (segment.isReference) {
        const chipClasses = [
          'expr-ref-chip',
          segment.isConnected ? 'expr-ref-chip--valid' : 'expr-ref-chip--error',
          ...segmentDiagnostics.map(diagnosticClassName),
        ].join(' ');
        const escapedRef = segment.text
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;');
        const escapedAddress = (segment.sourceAddress ?? '')
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;');
        const escapedText = segment.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<span class="${chipClasses}" contenteditable="false" data-ref="${escapedRef}" data-address="${escapedAddress}" data-token="${escapedRef}">${escapedText}</span>${diagnosticBubbleHtml}`;
      } else if (segment.isConstant) {
        const constantClasses = [
          'expr-const-chip',
          ...segmentDiagnostics.map(diagnosticClassName),
        ].join(' ');
        const sourceName = (segment.constantName ?? segment.text)
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;');
        const displayText = (segment.constantDisplay ?? segment.text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<span class="${constantClasses}" contenteditable="false" data-const="${sourceName}" data-token="${sourceName}">${displayText}</span>${diagnosticBubbleHtml}`;
      } else {
        return renderPlainTextSegment(segment, syntaxSpans, segmentDiagnostics);
      }
    })
    .join('');
}

function renderPlainTextSegment(
  segment: ReturnType<typeof tokenizeExpression>[number],
  syntaxSpans: readonly ExpressionSyntaxSpan[],
  diagnostics: readonly ExpressionInlineDiagnostic[],
): string {
  const boundaries = new Set<number>([segment.start, segment.end]);
  for (const syntaxSpan of syntaxSpans) {
    if (syntaxSpan.start < segment.end && syntaxSpan.end > segment.start) {
      boundaries.add(Math.max(segment.start, syntaxSpan.start));
      boundaries.add(Math.min(segment.end, syntaxSpan.end));
    }
  }
  for (const diagnostic of diagnostics) {
    boundaries.add(Math.max(segment.start, diagnostic.start));
    boundaries.add(Math.min(segment.end, diagnostic.end));
  }

  const orderedBoundaries = Array.from(boundaries).sort((left, right) => left - right);
  const parts: string[] = [];

  for (let index = 0; index < orderedBoundaries.length - 1; index++) {
    const partStart = orderedBoundaries[index];
    const partEnd = orderedBoundaries[index + 1];
    if (partStart === partEnd) continue;

    const textSlice = segment.text.slice(partStart - segment.start, partEnd - segment.start);
    const classes = [
      syntaxSpans.find((span) => span.start <= partStart && span.end >= partEnd)?.className,
      ...diagnostics
        .filter((diagnostic) => diagnostic.start < partEnd && diagnostic.end > partStart)
        .map(diagnosticClassName),
    ].filter((value): value is string => Boolean(value));

    parts.push(renderTextSlice(textSlice, classes));

    parts.push(
      ...diagnostics
        .filter((diagnostic) => diagnostic.end === partEnd)
        .map(renderInlineDiagnostic),
    );
  }

  return parts.join('');
}

function renderTextSlice(text: string, classes: readonly string[]): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (classes.length === 0) {
    return escaped.replace(/\n/g, '<br>');
  }

  const className = classes.join(' ');
  return escaped
    .split('\n')
    .map((part) => (part.length > 0 ? `<span class="${className}">${part}</span>` : ''))
    .join('<br>');
}

function renderInlineDiagnostic(diagnostic: ExpressionInlineDiagnostic): string {
  const escapedMessage = diagnostic.message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const severityClass = diagnostic.severity === 'warning'
    ? 'expr-inline-diagnostic--warning'
    : 'expr-inline-diagnostic--error';
  return `<span class="expr-inline-diagnostic ${severityClass}" contenteditable="false">${escapedMessage}</span>`;
}

function diagnosticClassName(diagnostic: ExpressionInlineDiagnostic): string {
  return diagnostic.severity === 'warning'
    ? 'expr-diagnostic expr-diagnostic--warning'
    : 'expr-diagnostic expr-diagnostic--error';
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
      addressRegistry,
      onChange,
      onBlur,
      maxLength = 500,
      placeholder = 'e.g., sin(circle_1.radius * 2)',
      hasError = false,
      diagnostics = [],
      syntaxSpans = [],
      onKeyDown: externalOnKeyDown,
    },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastRenderedValue = useRef(value);
    const lastRenderSignature = useRef('');

    // [LAW:one-source-of-truth] Connected refs are derived from canonical
    // output addresses built from the actual edge source endpoints.
    const connectedAddresses = useMemo(() => {
      const set = new Set<string>();

      for (const edge of patch.edges) {
        if (edge.to.kind !== 'port') continue;
        if (edge.to.blockId !== blockId || edge.to.slotId !== 'refs') continue;
        if (edge.from.kind !== 'port') continue;

        const sourceBlock = patch.blocks.get(edge.from.blockId as import('../../types').BlockId);
        if (sourceBlock) {
          set.add(addressToString(getOutputAddress(sourceBlock, edge.from.slotId as import('../../types').PortId)));
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
        editorRef.current.innerHTML = buildInnerHTML(text, addressRegistry, connectedAddresses, diagnostics, syntaxSpans);
        lastRenderedValue.current = text;
        lastRenderSignature.current = JSON.stringify({ text, diagnostics, syntaxSpans });
        requestAnimationFrame(() => {
          if (editorRef.current) {
            setCursorByPlainTextOffset(editorRef.current, cursorOff);
          }
        });
      },
    }), [addressRegistry, connectedAddresses, diagnostics, syntaxSpans]);

    const renderSignature = useMemo(
      () => JSON.stringify({ text: value, diagnostics, syntaxSpans }),
      [diagnostics, syntaxSpans, value],
    );

    // Prop-driven updates (external value or inline decoration changes)
    useEffect(() => {
      if (!editorRef.current) return;
      if (renderSignature !== lastRenderSignature.current || value !== lastRenderedValue.current) {
        const cursorOff = getCursorOffsetInPlainText(editorRef.current);
        editorRef.current.innerHTML = buildInnerHTML(value, addressRegistry, connectedAddresses, diagnostics, syntaxSpans);
        lastRenderedValue.current = value;
        lastRenderSignature.current = renderSignature;
        requestAnimationFrame(() => {
          if (editorRef.current) {
            setCursorByPlainTextOffset(editorRef.current, cursorOff);
          }
        });
      }
    }, [value, addressRegistry, connectedAddresses, diagnostics, renderSignature, syntaxSpans]);

    // Handle input (user typing)
    const handleInput = useCallback(() => {
      if (!editorRef.current) return;

      const plainText = serializeToPlainText(editorRef.current);

      if (plainText.length > maxLength) {
        editorRef.current.innerHTML = buildInnerHTML(
          lastRenderedValue.current,
          addressRegistry,
          connectedAddresses,
          diagnostics,
          syntaxSpans,
        );
        return;
      }

      lastRenderedValue.current = plainText;
      const cursorOffset = getCursorOffsetInPlainText(editorRef.current);
      onChange(plainText, cursorOffset);
    }, [maxLength, onChange, addressRegistry, connectedAddresses, diagnostics, syntaxSpans]);

    // Handle blur: re-render with chips
    const handleBlur = useCallback(() => {
      if (!editorRef.current) return;

      const plainText = serializeToPlainText(editorRef.current);
      editorRef.current.innerHTML = buildInnerHTML(plainText, addressRegistry, connectedAddresses, diagnostics, syntaxSpans);
      lastRenderedValue.current = plainText;
      lastRenderSignature.current = JSON.stringify({ text: plainText, diagnostics, syntaxSpans });

      onBlur();
    }, [onBlur, addressRegistry, connectedAddresses, diagnostics, syntaxSpans]);

    // Handle keydown
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      if (externalOnKeyDown) {
        externalOnKeyDown(e);
      }
    }, [externalOnKeyDown]);

    // Popover state for reference chips
    const [popoverData, setPopoverData] = useState<{
      shorthand: string;
      sourceAddress: string;
      position: { top: number; left: number };
    } | null>(null);
    const popoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('expr-ref-chip')) {
        const shorthand = target.getAttribute('data-ref');
        const sourceAddress = target.getAttribute('data-address');
        if (!shorthand || !sourceAddress) return;

        if (popoverTimeout.current) clearTimeout(popoverTimeout.current);

        const rect = target.getBoundingClientRect();
        setPopoverData({
          shorthand,
          sourceAddress,
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
      const resolved = addressRegistry.resolve(popoverData.sourceAddress);

      if (resolved?.kind === 'output') {
        const payloadStr = resolved.type.payload.kind;
        const cardAxis = resolved.type.extent.cardinality;
        let kindStr = 'One';
        if (cardAxis.kind === 'inst') {
          kindStr = cardAxis.value.kind === 'many' ? 'Many' : cardAxis.value.kind === 'zero' ? 'Const' : 'One';
        }
        return {
          blockType: resolved.block.type,
          portName: String(resolved.port.id),
          typeDesc: `${kindStr}<${payloadStr}>`,
          isConnected: true,
        };
      }

      return { blockType: 'Unknown', portName: popoverData.shorthand, typeDesc: 'unknown', isConnected: false };
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
