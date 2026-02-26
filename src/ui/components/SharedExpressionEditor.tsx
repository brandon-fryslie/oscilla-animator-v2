import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useStores } from '../../stores';
import { colors } from '../theme';
import type { Patch } from '../../graph/Patch';
import type { BlockId } from '../../types';
import { AddressRegistry } from '../../graph/address-registry';
import { SuggestionProvider } from '../../expr/suggestions';
import type { Suggestion, OutputSuggestion } from '../../expr/suggestions';
import { AutocompleteDropdown } from '../expression-editor/AutocompleteDropdown';
import { adjustPositionForViewport } from '../expression-editor/cursorPosition';
import { TokenExpressionEditor } from '../expression-editor/TokenExpressionEditor';
import type { TokenExpressionEditorHandle } from '../expression-editor/TokenExpressionEditor';
import { DockviewContext, getDockviewApiRef, openExpressionEditorPanel } from '../dockview';

export interface SharedExpressionEditorProps {
  readonly blockId: BlockId;
  readonly value: string;
  readonly patch: Patch;
  readonly showPopOutButton?: boolean;
  readonly liveCommitDebounceMs?: number;
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly onValueChange?: (value: string) => void;
}

function extractIdentifierPrefix(value: string, cursorPos: number): { prefix: string; startOffset: number } | null {
  if (cursorPos === 0) return null;

  let start = cursorPos - 1;
  while (start >= 0 && /[a-zA-Z0-9_]/.test(value[start])) {
    start--;
  }

  if (start >= 0 && value[start] === '.') {
    let blockStart = start - 1;
    while (blockStart >= 0 && /[a-zA-Z0-9_]/.test(value[blockStart])) {
      blockStart--;
    }
    const identifierStart = blockStart + 1;
    const prefix = value.substring(identifierStart, cursorPos);
    return { prefix, startOffset: identifierStart };
  }

  const identifierStart = start + 1;
  if (identifierStart >= cursorPos) {
    return null;
  }

  const prefix = value.substring(identifierStart, cursorPos);
  return { prefix, startOffset: identifierStart };
}

function detectBlockContext(value: string, cursorPos: number): string | null {
  if (cursorPos === 0) return null;

  if (value[cursorPos - 1] === '.') {
    let start = cursorPos - 2;
    while (start >= 0 && /[a-zA-Z0-9_]/.test(value[start])) {
      start--;
    }
    const blockName = value.substring(start + 1, cursorPos - 1);
    return blockName || null;
  }

  const identifierPrefix = extractIdentifierPrefix(value, cursorPos);
  if (identifierPrefix && identifierPrefix.startOffset > 0 && value[identifierPrefix.startOffset - 1] === '.') {
    let start = identifierPrefix.startOffset - 2;
    while (start >= 0 && /[a-zA-Z0-9_]/.test(value[start])) {
      start--;
    }
    const blockName = value.substring(start + 1, identifierPrefix.startOffset - 1);
    return blockName || null;
  }

  return null;
}

function computeSuggestionInsertion(
  currentValue: string,
  selectionStart: number,
  suggestion: Suggestion,
  prefixStartOffset: number
): { newValue: string; newCursorPos: number } {
  const before = currentValue.substring(0, prefixStartOffset);
  const after = currentValue.substring(selectionStart);

  let insertText = suggestion.label;
  let cursorOffset = insertText.length;

  if (suggestion.type === 'function') {
    cursorOffset = insertText.length - 1;
  }

  if (suggestion.type === 'block') {
    insertText += '.';
    cursorOffset = insertText.length;
  }

  return {
    newValue: before + insertText + after,
    newCursorPos: prefixStartOffset + cursorOffset,
  };
}

export const SharedExpressionEditor = observer(function SharedExpressionEditor({
  blockId,
  value,
  patch,
  showPopOutButton = false,
  liveCommitDebounceMs,
  maxLength = 4000,
  placeholder = 'e.g., sin(circle_1.radius * 2)',
  onValueChange,
}: SharedExpressionEditorProps) {
  const { patch: patchStore, diagnostics: diagnosticsStore, expressionEditor } = useStores();
  const dockview = React.useContext(DockviewContext);
  const api = dockview?.api ?? getDockviewApiRef();
  const [localValue, setLocalValue] = useState(value);
  const tokenEditorRef = useRef<TokenExpressionEditorHandle>(null);

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [filterPrefix, setFilterPrefix] = useState('');
  const [blockContext, setBlockContext] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [filteredSuggestions, setFilteredSuggestions] = useState<readonly Suggestion[]>([]);

  const suggestionProvider = useMemo(() => {
    const registry = AddressRegistry.buildFromPatch(patch);
    return new SuggestionProvider(patch, registry);
  }, [patch]);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    onValueChange?.(localValue);
  }, [localValue, onValueChange]);

  useEffect(() => {
    if (liveCommitDebounceMs === undefined || liveCommitDebounceMs < 0) return;
    if (localValue === value) return;

    const timer = window.setTimeout(() => {
      patchStore.updateBlockParams(blockId, { expression: localValue });
    }, liveCommitDebounceMs);
    return () => window.clearTimeout(timer);
  }, [blockId, liveCommitDebounceMs, localValue, patchStore, value]);

  const expressionError = useMemo(() => {
    const blockErrors = diagnosticsStore.activeDiagnostics.filter(
      (diag) =>
        diag.primaryTarget.kind === 'block'
        && diag.primaryTarget.blockId === blockId
        && (diag.code === 'E_EXPR_SYNTAX' || diag.code === 'E_EXPR_TYPE' || diag.code === 'E_EXPR_COMPILE')
    );
    return blockErrors.length > 0 ? blockErrors[0] : null;
  }, [blockId, diagnosticsStore.activeDiagnostics]);

  useEffect(() => {
    if (!showAutocomplete) {
      setFilteredSuggestions([]);
      return;
    }

    let suggestions: readonly Suggestion[];

    if (blockContext) {
      suggestions = suggestionProvider.suggestBlockPorts(blockContext);
      if (filterPrefix) {
        const dotIndex = filterPrefix.indexOf('.');
        const portPrefix = dotIndex >= 0 ? filterPrefix.substring(dotIndex + 1) : filterPrefix;
        const lowerPrefix = portPrefix.toLowerCase();
        suggestions = suggestions.filter(s => s.label.toLowerCase().includes(lowerPrefix));
      }
    } else {
      suggestions = suggestionProvider.filterSuggestions(filterPrefix);
    }

    setFilteredSuggestions(suggestions);
    setSuggestionIndex(0);
  }, [blockContext, filterPrefix, showAutocomplete, suggestionProvider]);

  const updateDropdownPosition = useCallback((_cursor: number) => {
    const editorEl = tokenEditorRef.current?.getElement();
    if (!editorEl) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const adjusted = adjustPositionForViewport(
        { top: rect.bottom + 4, left: rect.left },
        400, 500
      );
      setDropdownPosition(adjusted);
    }
  }, []);

  const handleEditorChange = useCallback((nextValue: string, cursor: number) => {
    setLocalValue(nextValue);
    setCursorPosition(cursor);

    const blockCtx = detectBlockContext(nextValue, cursor);
    setBlockContext(blockCtx);

    const identifierData = extractIdentifierPrefix(nextValue, cursor);
    if (identifierData) {
      setFilterPrefix(identifierData.prefix);
      setShowAutocomplete(true);
      updateDropdownPosition(cursor);
    } else if (blockCtx) {
      setFilterPrefix('');
      setShowAutocomplete(true);
      updateDropdownPosition(cursor);
    } else {
      setShowAutocomplete(false);
      setFilterPrefix('');
    }
  }, [updateDropdownPosition]);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (localValue !== value) {
        patchStore.updateBlockParams(blockId, { expression: localValue });
      }
    }, 120);
  }, [blockId, localValue, patchStore, value]);

  const handleSelectSuggestion = useCallback((suggestion: Suggestion) => {
    const identifierData = extractIdentifierPrefix(localValue, cursorPosition);
    const prefixStartOffset = identifierData?.startOffset ?? cursorPosition;
    const { newValue, newCursorPos } = computeSuggestionInsertion(
      localValue, cursorPosition, suggestion, prefixStartOffset
    );
    setLocalValue(newValue);
    setCursorPosition(newCursorPos);

    if (suggestion.type === 'output') {
      const outputSuggestion = suggestion as OutputSuggestion;
      patchStore.addCollectEdge(
        { kind: 'port', blockId: outputSuggestion.blockId, slotId: outputSuggestion.portId },
        { kind: 'port', blockId, slotId: 'refs' },
        `${outputSuggestion.blockId}.${outputSuggestion.portId}`
      );
    }

    setShowAutocomplete(false);
    setFilterPrefix('');
    setBlockContext(null);

    requestAnimationFrame(() => {
      if (!tokenEditorRef.current) return;
      tokenEditorRef.current.setCursorOffset(newCursorPos);
      tokenEditorRef.current.refreshChips();
      tokenEditorRef.current.focus();
    });
  }, [blockId, cursorPosition, localValue, patchStore]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (showAutocomplete && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredSuggestions[suggestionIndex];
        if (selected) handleSelectSuggestion(selected);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        setFilterPrefix('');
        setBlockContext(null);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
      e.preventDefault();
      setShowAutocomplete(true);
      setFilterPrefix('');
      setBlockContext(null);
      updateDropdownPosition(cursorPosition);
    }
  }, [cursorPosition, filteredSuggestions, handleSelectSuggestion, showAutocomplete, suggestionIndex, updateDropdownPosition]);

  const handlePopOut = useCallback(() => {
    if (localValue !== value) {
      patchStore.updateBlockParams(blockId, { expression: localValue });
    }
    expressionEditor.openForBlock(blockId);
    const resolvedApi = api ?? getDockviewApiRef();
    if (!resolvedApi) {
      // [LAW:single-enforcer] UI action failures are logged through diagnostics.
      diagnosticsStore.log({
        level: 'error',
        message: 'Expression pop-out failed: Dockview API unavailable',
      });
      return;
    }
    openExpressionEditorPanel(resolvedApi, blockId);
  }, [api, blockId, expressionEditor, localValue, patchStore, value]);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block' }}>
          Expression
        </label>
        {showPopOutButton && (
          <button
            type="button"
            onClick={handlePopOut}
            title="Open in docked Expression Editor panel"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              border: '1px solid #355187',
              background: '#12213f',
              color: '#d9deea',
              fontSize: '11px',
              borderRadius: '4px',
              padding: '2px 6px',
              cursor: 'pointer',
            }}
          >
            <OpenInNewRoundedIcon sx={{ fontSize: 13 }} />
            Pop out
          </button>
        )}
      </div>

      <TokenExpressionEditor
        ref={tokenEditorRef}
        blockId={blockId}
        value={localValue}
        patch={patch}
        onChange={handleEditorChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        maxLength={maxLength}
        placeholder={placeholder}
        hasError={expressionError !== null}
      />

      <div style={{ fontSize: '10px', color: colors.textSecondary, textAlign: 'right', marginTop: '2px' }}>
        {localValue.length} / {maxLength}
      </div>

      {expressionError && (
        <div style={{
          fontSize: '11px',
          color: colors.error,
          marginTop: '4px',
          padding: '4px 8px',
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderRadius: '4px',
          borderLeft: `3px solid ${colors.error}`,
        }}>
          {expressionError.message}
        </div>
      )}

      <AutocompleteDropdown
        suggestions={filteredSuggestions}
        selectedIndex={suggestionIndex}
        onSelect={handleSelectSuggestion}
        isVisible={showAutocomplete}
        position={dropdownPosition}
        onClose={() => {
          setShowAutocomplete(false);
          setFilterPrefix('');
          setBlockContext(null);
        }}
      />
    </div>
  );
});
