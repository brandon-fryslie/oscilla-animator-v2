/**
 * CompositeEditorDslSidebar
 *
 * Displays HCL text representation of the composite being edited.
 * Syncs bidirectionally:
 * - Graph → DSL: Auto-update when graph changes (debounced, paused when focused)
 * - DSL → Graph: Explicit apply on blur
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { reaction } from 'mobx';
import type { CompositeEditorStore } from '../../stores/CompositeEditorStore';
import type { PatchDslError } from '../../patch-dsl';
import './CompositeEditorDslSidebar.css';

interface Props {
  store: CompositeEditorStore;
}

export const CompositeEditorDslSidebar = observer(function CompositeEditorDslSidebar({
  store,
}: Props) {
  // Local state for textarea content (editable by user)
  const [text, setText] = useState<string>('');

  // Parse errors from last apply attempt
  const [errors, setErrors] = useState<PatchDslError[]>([]);

  // Track whether textarea is focused (prevents auto-update during user edit)
  const [isFocused, setIsFocused] = useState(false);

  // Track if text has been edited but not yet applied (dirty state)
  const [isDirty, setIsDirty] = useState(false);

  // Debounce timer for graph → DSL updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync graph → DSL using MobX reaction (only when not focused)
  useEffect(() => {
    // Use MobX reaction to properly track observable changes
    const dispose = reaction(
      // Track function: MobX tracks all observables accessed here
      () => {
        // Access observables to track them
        const blocks = store.internalBlocks.size; // Access the size to track changes
        const edges = store.internalEdges.length;
        const inputs = store.exposedInputs.length;
        const outputs = store.exposedOutputs.length;
        const name = store.metadata.name;

        // Return a tracking object that changes when graph changes
        return { blocks, edges, inputs, outputs, name };
      },
      // Effect function: called when tracked values change
      () => {
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
            setIsDirty(false); // Graph update resets dirty state
          }
        }, 200); // 200ms debounce
      }
    );

    // Initial sync when component mounts
    const hcl = store.toHCL();
    if (hcl !== null) {
      setText(hcl);
    }

    return () => {
      dispose();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [store, isFocused]);

  // Apply DSL → Graph
  const handleApply = useCallback(() => {
    const result = store.fromHCL(text);
    if (result.errors.length > 0) {
      setErrors(result.errors);
    } else {
      setErrors([]);
      setIsDirty(false);
    }
  }, [store, text]);

  // Handle textarea blur (explicit apply)
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (isDirty) {
      handleApply();
    }
  }, [handleApply, isDirty]);

  // Handle textarea focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  // Handle text change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setIsDirty(true);
  }, []);

  // Determine textarea className based on state
  const textareaClass = [
    'composite-editor-dsl-sidebar__textarea',
    isDirty && 'composite-editor-dsl-sidebar__textarea--dirty',
    errors.length > 0 && 'composite-editor-dsl-sidebar__textarea--error',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="composite-editor-dsl-sidebar">
      <div className="composite-editor-dsl-sidebar__header">
        <h3>HCL Definition</h3>
      </div>

      <textarea
        className={textareaClass}
        value={text}
        onChange={handleChange}
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
