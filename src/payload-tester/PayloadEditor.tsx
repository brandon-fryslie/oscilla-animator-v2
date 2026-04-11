import React, { useCallback } from 'react';

interface PayloadEditorProps {
  json: string;
  onJsonChange: (json: string) => void;
  onSubmit: (json: string) => void;
  disabled: boolean;
  submitLabel?: string;
}

export const PayloadEditor: React.FC<PayloadEditorProps> = ({ json, onJsonChange, onSubmit, disabled, submitLabel }) => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) {
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit(json);
    }
  }, [disabled, json, onSubmit]);

  return (
    <>
      <textarea
        value={json}
        onChange={(e) => onJsonChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          flex: 1,
          resize: 'none',
          fontFamily: '"SF Mono", Monaco, Consolas, "Liberation Mono", monospace',
          fontSize: 12,
          lineHeight: 1.5,
          padding: 8,
          background: '#141517',
          color: '#ccc',
          border: 'none',
          borderBottom: '1px solid #333',
          outline: 'none',
          tabSize: 2,
        }}
      />
      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onSubmit(json)}
          disabled={disabled}
          style={{
            padding: '4px 16px',
            background: disabled ? '#333' : '#7950F2',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {submitLabel ?? 'Submit'} (Cmd+Enter)
        </button>
      </div>
    </>
  );
};
