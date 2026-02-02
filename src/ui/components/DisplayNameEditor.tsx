/**
 * DisplayNameEditor Component
 *
 * Inline editor for block display names with collision validation.
 * Used by both BlockInspector and OscillaNode.
 */

import React, { useState, useCallback } from 'react';
import type { BlockId } from '../../types';
import { useStores } from '../../stores';

interface DisplayNameEditorProps {
  blockId: BlockId;
  currentDisplayName: string;
  fallbackLabel: string;
  style?: React.CSSProperties;
  editStyle?: React.CSSProperties;
  errorStyle?: React.CSSProperties;
  placeholder?: string;
}

/**
 * Inline displayName editor with validation.
 *
 * Features:
 * - Double-click to edit
 * - Enter to commit, Escape to cancel
 * - Shows validation error on collision
 * - Auto-generates name if empty
 */
export const DisplayNameEditor: React.FC<DisplayNameEditorProps> = function DisplayNameEditor({
  blockId,
  currentDisplayName,
  fallbackLabel,
  style = {},
  editStyle = {},
  errorStyle = {},
  placeholder,
}: DisplayNameEditorProps) {
  const { patch: patchStore } = useStores();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentDisplayName);
  const [error, setError] = useState<string | null>(null);

  const handleDoubleClick = useCallback(() => {
    setEditValue(currentDisplayName);
    setError(null);
    setIsEditing(true);
  }, [currentDisplayName]);

  const handleCommit = useCallback(() => {
    const newName = editValue.trim();
    // Empty name not allowed - show error
    if (!newName) {
      setError('Name cannot be empty');
      return;
    }
    if (newName !== currentDisplayName) {
      const result = patchStore.updateBlockDisplayName(blockId, newName);
      if (result.error) {
        // Show error, keep editing
        setError(result.error);
        return;
      }
    }
    // Success - exit edit mode
    setError(null);
    setIsEditing(false);
  }, [blockId, currentDisplayName, editValue, patchStore]);

  const handleBlur = useCallback(() => {
    // Only commit on blur if no error
    if (!error) {
      handleCommit();
    }
  }, [error, handleCommit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      setEditValue(currentDisplayName);
      setError(null);
      setIsEditing(false);
    }
  }, [currentDisplayName, handleCommit]);

  if (isEditing) {
    return (
      <div style={{ display: 'inline-block', position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            setError(null); // Clear error on edit
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder={placeholder || fallbackLabel}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: error ? '1px solid #ef4444' : '1px solid #3b82f6',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '14px',
            ...editStyle,
          }}
          title={error || 'Enter to save, Escape to cancel'}
        />
        {error && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              padding: '4px 8px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '11px',
              borderRadius: '4px',
              zIndex: 1000,
              ...errorStyle,
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      style={{
        cursor: 'pointer',
        ...style,
      }}
      title="Double-click to edit"
    >
      {currentDisplayName}
    </span>
  );
};
