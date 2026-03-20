import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Switch } from '@mantine/core';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { compilePartialPatch, type PartialCompileResult } from '../../compiler';
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
import type { ExpressionInlineDiagnostic } from '../expression-editor/editorAnnotations';
import { buildExpressionSyntaxSpans } from '../expression-editor/syntaxHighlighting';
import { DockviewContext, openExpressionEditorPanel } from '../dockview';

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

interface AddressRegistryFailure {
  readonly message: string;
  readonly offendingBlockId: BlockId | null;
}

function parseAddressRegistryFailure(error: unknown): AddressRegistryFailure {
  const message = error instanceof Error ? error.message : String(error);
  const blockMatch = message.match(/block "([^"]+)"/);
  return {
    message,
    offendingBlockId: (blockMatch?.[1] ?? null) as BlockId | null,
  };
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

const EMPTY_DIAGNOSTICS: readonly ExpressionInlineDiagnostic[] = [];
const EMPTY_SUMMARY_DIAGNOSTICS: readonly { code: string; severity: 'error' | 'warning'; message: string }[] = [];

function toExpressionEditorSeverity(severity: string): 'warning' | 'error' | null {
  if (severity === 'warn') {
    return 'warning';
  }
  if (severity === 'error' || severity === 'fatal') {
    return 'error';
  }
  return null;
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
  const api = dockview?.api ?? null;
  const [autoCompileOnKeypress, setAutoCompileOnKeypress] = useState(
    liveCommitDebounceMs !== undefined && liveCommitDebounceMs >= 0,
  );
  const tokenEditorRef = useRef<TokenExpressionEditorHandle>(null);
  const draftValue = expressionEditor.getDraftValue(blockId, value);
  const persistedValue = expressionEditor.getPersistedValue(blockId, value);
  const isDirty = draftValue !== persistedValue;
  const deferredDraftValue = useDeferredValue(draftValue);

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [filterPrefix, setFilterPrefix] = useState('');
  const [blockContext, setBlockContext] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [filteredSuggestions, setFilteredSuggestions] = useState<readonly Suggestion[]>([]);
  const [draftCompilation, setDraftCompilation] = useState<PartialCompileResult | null>(null);
  const lastRegistryFailureRef = useRef<string | null>(null);

  const addressRegistryState = useMemo(() => {
    try {
      return {
        registry: AddressRegistry.buildFromPatch(patch),
        failure: null,
      };
    } catch (error) {
      return {
        registry: null,
        failure: parseAddressRegistryFailure(error),
      };
    }
  }, [patch]);

  const suggestionProvider = useMemo(() => {
    if (!addressRegistryState.registry) return null;
    return new SuggestionProvider(patch, addressRegistryState.registry);
  }, [addressRegistryState.registry, patch]);

  useEffect(() => {
    expressionEditor.syncPersistedValue(blockId, value);
  }, [blockId, expressionEditor, value]);

  useEffect(() => {
    onValueChange?.(draftValue);
  }, [draftValue, onValueChange]);

  useEffect(() => {
    const failure = addressRegistryState.failure;
    if (!failure) {
      lastRegistryFailureRef.current = null;
      return;
    }
    if (lastRegistryFailureRef.current === failure.message) return;
    lastRegistryFailureRef.current = failure.message;
    const offendingBlock = failure.offendingBlockId ? patch.blocks.get(failure.offendingBlockId) : null;
    // [LAW:single-enforcer] SharedExpressionEditor is the recovery boundary for
    // editor-local registry failures; it converts render exceptions into user-visible diagnostics.
    diagnosticsStore.log({
      level: 'error',
      message: `Expression editor fallback: ${failure.message}`,
      details: [
        {
          message: offendingBlock
            ? `Invalid block: ${offendingBlock.displayName}`
            : `Invalid block: ${failure.offendingBlockId ?? 'unknown'}`,
          blockId: failure.offendingBlockId ?? undefined,
          blockType: offendingBlock?.type,
        },
      ],
    });
  }, [addressRegistryState.failure, diagnosticsStore, patch.blocks]);

  // [LAW:single-enforcer] Draft persistence flows through one callback so all
  // editor instances apply the same patch-write + draft-sync sequence.
  const commitDraft = useCallback((nextValue: string) => {
    patchStore.updateBlockParams(blockId, { expression: nextValue });
    expressionEditor.commitDraftValue(blockId, nextValue);
  }, [blockId, expressionEditor, patchStore]);

  useEffect(() => {
    if (!autoCompileOnKeypress) return;
    if (!isDirty) return;

    const commitDelayMs = liveCommitDebounceMs !== undefined && liveCommitDebounceMs >= 0
      ? liveCommitDebounceMs
      : 0;
    const timer = window.setTimeout(() => {
      commitDraft(draftValue);
    }, commitDelayMs);
    return () => window.clearTimeout(timer);
  }, [autoCompileOnKeypress, commitDraft, draftValue, isDirty, liveCommitDebounceMs]);

  useEffect(() => {
    expressionEditor.pruneDrafts(patch.blocks.keys());
  }, [expressionEditor, patch.blocks]);

  useEffect(() => {
    let cancelled = false;
    const nextCompilation = compilePartialPatch(patch, {
      rootBlockIds: [blockId],
      blockParamOverrides: [{ blockId, params: { expression: deferredDraftValue } }],
      compileId: `expression-editor:${blockId}`,
    });
    if (cancelled) {
      return;
    }
    startTransition(() => {
      if (!cancelled) {
        setDraftCompilation(nextCompilation);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [blockId, deferredDraftValue, patch]);

  const inlineDiagnostics = useMemo<readonly ExpressionInlineDiagnostic[]>(() => {
    if (!draftCompilation) {
      return EMPTY_DIAGNOSTICS;
    }
    return draftCompilation.diagnostics.flatMap((diagnostic) => {
      const sourceSpan = diagnostic.sourceSpan;
      if (!sourceSpan || sourceSpan.kind !== 'blockParam') {
        return [];
      }
      if (sourceSpan.blockId !== blockId || sourceSpan.paramId !== 'expression' || !sourceSpan.range) {
        return [];
      }
      const severity = toExpressionEditorSeverity(diagnostic.severity);
      if (!severity) {
        return [];
      }
      return [{
        code: diagnostic.code,
        severity,
        message: [diagnostic.message, sourceSpan.suggestion].filter(Boolean).join(' '),
        start: sourceSpan.range.start,
        end: sourceSpan.range.end,
      }];
    });
  }, [blockId, draftCompilation]);

  const summaryDiagnostics = useMemo(() => {
    if (!draftCompilation) {
      return EMPTY_SUMMARY_DIAGNOSTICS;
    }
    return draftCompilation.diagnostics
      .filter((diagnostic) => {
        if (!toExpressionEditorSeverity(diagnostic.severity)) {
          return false;
        }
        if (diagnostic.primaryTarget.kind === 'block' && diagnostic.primaryTarget.blockId === blockId) {
          return true;
        }
        const sourceSpan = diagnostic.sourceSpan;
        return sourceSpan?.kind === 'blockParam' && sourceSpan.blockId === blockId;
      })
      .map((diagnostic) => ({
        code: diagnostic.code,
        severity: toExpressionEditorSeverity(diagnostic.severity)!,
        message: diagnostic.message,
      }));
  }, [blockId, draftCompilation]);

  const hasInlineError = useMemo(() => {
    return inlineDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
  }, [inlineDiagnostics]);

  const syntaxSpans = useMemo(() => buildExpressionSyntaxSpans(draftValue), [draftValue]);

  useEffect(() => {
    if (!showAutocomplete || !suggestionProvider) {
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
    expressionEditor.setDraftValue(blockId, nextValue);
    setCursorPosition(cursor);

    const blockCtx = detectBlockContext(nextValue, cursor);
    setBlockContext(blockCtx);

    const identifierData = extractIdentifierPrefix(nextValue, cursor);
    if (identifierData) {
      setFilterPrefix(identifierData.prefix);
      setShowAutocomplete(suggestionProvider !== null);
      updateDropdownPosition(cursor);
    } else if (blockCtx) {
      setFilterPrefix('');
      setShowAutocomplete(suggestionProvider !== null);
      updateDropdownPosition(cursor);
    } else {
      setShowAutocomplete(false);
      setFilterPrefix('');
    }
  }, [blockId, expressionEditor, suggestionProvider, updateDropdownPosition]);

  const handleBlur = useCallback(() => {
    if (autoCompileOnKeypress) return;
    setTimeout(() => {
      if (isDirty) {
        commitDraft(draftValue);
      }
    }, 120);
  }, [autoCompileOnKeypress, commitDraft, draftValue, isDirty]);

  const handleSelectSuggestion = useCallback((suggestion: Suggestion) => {
    const identifierData = extractIdentifierPrefix(draftValue, cursorPosition);
    const prefixStartOffset = identifierData?.startOffset ?? cursorPosition;
    const { newValue, newCursorPos } = computeSuggestionInsertion(
      draftValue, cursorPosition, suggestion, prefixStartOffset
    );
    expressionEditor.setDraftValue(blockId, newValue);
    setCursorPosition(newCursorPos);

    if (suggestion.type === 'output') {
      const outputSuggestion = suggestion as OutputSuggestion;
      patchStore.addCollectEdge(
        { kind: 'port', blockId: outputSuggestion.blockId, slotId: outputSuggestion.portId },
        { kind: 'port', blockId, slotId: 'refs' }
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
  }, [blockId, cursorPosition, draftValue, expressionEditor, patchStore]);

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

    if ((e.ctrlKey || e.metaKey) && e.key === ' ' && suggestionProvider) {
      e.preventDefault();
      setShowAutocomplete(true);
      setFilterPrefix('');
      setBlockContext(null);
      updateDropdownPosition(cursorPosition);
    }
  }, [cursorPosition, filteredSuggestions, handleSelectSuggestion, showAutocomplete, suggestionIndex, suggestionProvider, updateDropdownPosition]);

  const handlePopOut = useCallback(() => {
    if (isDirty) {
      commitDraft(draftValue);
    }
    expressionEditor.openForBlock(blockId);
    if (!api) {
      // [LAW:single-enforcer] UI action failures are logged through diagnostics.
      diagnosticsStore.log({
        level: 'error',
        message: 'Expression pop-out failed: Dockview API unavailable',
      });
      return;
    }
    openExpressionEditorPanel(api, blockId);
  }, [api, blockId, commitDraft, diagnosticsStore, draftValue, expressionEditor, isDirty]);

  const registryFailureMessage = useMemo(() => {
    const failure = addressRegistryState.failure;
    if (!failure) return null;
    const offendingBlock = failure.offendingBlockId ? patch.blocks.get(failure.offendingBlockId) : null;
    const offendingLabel = offendingBlock?.displayName ?? failure.offendingBlockId ?? 'unknown block';
    return `Invalid block data on "${offendingLabel}". Expression editor fallback mode is active until the patch shape is repaired.`;
  }, [addressRegistryState.failure, patch.blocks]);

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

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '8px',
      }}>
        <div style={{ fontSize: '11px', color: colors.textSecondary }}>
          Syntax checks run as you type. Enable auto-compile to save edits live.
        </div>
        <Switch
          checked={autoCompileOnKeypress}
          onChange={(event) => setAutoCompileOnKeypress(event.currentTarget.checked)}
          size="sm"
          color="cyan"
          label="Auto-compile on keypress"
          styles={{
            body: { alignItems: 'center' },
            label: { color: colors.textPrimary, fontSize: '11px', paddingLeft: '8px' },
            track: { cursor: 'pointer' },
            thumb: { cursor: 'pointer' },
          }}
        />
      </div>

      {addressRegistryState.registry ? (
        <TokenExpressionEditor
          ref={tokenEditorRef}
          blockId={blockId}
          value={draftValue}
          patch={patch}
          addressRegistry={addressRegistryState.registry}
          onChange={handleEditorChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          placeholder={placeholder}
          hasError={hasInlineError}
          diagnostics={inlineDiagnostics}
          syntaxSpans={syntaxSpans}
        />
      ) : (
        <textarea
          value={draftValue}
          onChange={(e) => expressionEditor.setDraftValue(blockId, e.target.value)}
          onBlur={handleBlur}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={12}
          style={{
            width: '100%',
            minHeight: '220px',
            boxSizing: 'border-box',
            resize: 'vertical',
            borderRadius: '6px',
            border: `1px solid ${colors.error}`,
            background: '#0f1727',
            color: colors.textPrimary,
            padding: '10px 12px',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        />
      )}

      <div style={{ fontSize: '10px', color: colors.textSecondary, textAlign: 'right', marginTop: '2px' }}>
        {draftValue.length} / {maxLength}
      </div>

      {registryFailureMessage && (
        <div style={{
          fontSize: '11px',
          color: colors.error,
          marginTop: '4px',
          padding: '4px 8px',
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderRadius: '4px',
          borderLeft: `3px solid ${colors.error}`,
        }}>
          {registryFailureMessage}
        </div>
      )}

      {summaryDiagnostics.length > 0 && (
        <div style={{ display: 'grid', gap: '4px', marginTop: '4px' }}>
          {summaryDiagnostics.map((diagnostic, index) => {
            const isWarning = diagnostic.severity === 'warning';
            return (
              <div
                key={`${diagnostic.code}-${diagnostic.message}-${index}`}
                style={{
                  fontSize: '11px',
                  color: isWarning ? '#ffe8a3' : colors.error,
                  padding: '4px 8px',
                  backgroundColor: isWarning ? 'rgba(240, 195, 91, 0.1)' : 'rgba(255, 0, 0, 0.1)',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${isWarning ? '#f0c35b' : colors.error}`,
                }}
              >
                {diagnostic.message}
              </div>
            );
          })}
        </div>
      )}

      <AutocompleteDropdown
        suggestions={filteredSuggestions}
        selectedIndex={suggestionIndex}
        onSelect={handleSelectSuggestion}
        isVisible={showAutocomplete && suggestionProvider !== null}
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
