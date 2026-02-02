/**
 * CompositeEditorDslSidebar
 *
 * Displays HCL text representation of the composite being edited.
 * Syncs bidirectionally:
 * - Graph → DSL: Auto-update when graph changes (debounced, paused when focused)
 * - DSL → Graph: Explicit apply on blur or button
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import type { CompositeEditorStore } from '../../stores/CompositeEditorStore';
import type { PatchDslError } from '../../patch-dsl';
import './CompositeEditorDslSidebar.css';

interface Props {
  store: CompositeEditorStore;
  visible: boolean;
}

export const CompositeEditorDslSidebar = observer(function CompositeEditorDslSidebar({
  store,
  visible,
}: Props) {
  // Local state for textarea content (editable by user)
  const [text, setText] = useState<string>('');

  // Parse errors from last apply attempt
  const [errors, setErrors] = useState<PatchDslError[]>([]);

  // Track whether textarea is focused (prevents auto-update during user edit)
  const [isFocused, setIsFocused] = useState(false);

  // Debounce timer for graph → DSL updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync graph → DSL (only when not focused)
  useEffect(() => {
    if (isFocused) {
      // User is editing - don't overwrite their work
      return;
    }

    // Debounce updates to avoid jank during rapid graph changes
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const hcl = store.toHCL();
      if (hcl !== null) {
        setText(hcl);
        setErrors([]); // Clear errors when graph changes
      }
    }, 200); // 200ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    store,
    isFocused,
    // React to any observable changes in the store
    // MobX will track these dependencies automatically
    store.internalBlocks,
    store.internalEdges,
    store.exposedInputs,
    store.exposedOutputs,
    store.metadata,
  ]);

  // Apply DSL → Graph
  const handleApply = useCallback(() => {
    const result = store.fromHCL(text);
    if (result.errors.length > 0) {
      setErrors(result.errors);
    } else {
      setErrors([]);
    }
  }, [store, text]);

  // Handle textarea blur (explicit apply)
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    handleApply();
  }, [handleApply]);

  // Handle textarea focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="composite-editor-dsl-sidebar">
      <div className="composite-editor-dsl-sidebar__header">
        <h3>HCL Definition</h3>
        <button
          className="composite-editor-dsl-sidebar__apply-btn"
          onClick={handleApply}
          title="Apply DSL changes to graph"
        >
          Apply
        </button>
      </div>

      <textarea
        className="composite-editor-dsl-sidebar__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        spellCheck={false}
        placeholder="# Composite HCL definition will appear here..."
      />

      {errors.length > 0 && (
        <div className="composite-editor-dsl-sidebar__errors">
          <h4>Parse Errors</h4>
          {errors.map((err, idx) => (
            <div key={idx} className="composite-editor-dsl-sidebar__error">
              <span className="composite-editor-dsl-sidebar__error-location">
                Position {err.pos.start}-{err.pos.end}
              </span>
              <span className="composite-editor-dsl-sidebar__error-message">
                {err.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
