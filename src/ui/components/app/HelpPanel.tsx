/**
 * Help Panel Component
 *
 * Displays usage instructions and keyboard shortcuts.
 */

import React from 'react';
import { colors } from '../../theme';

export const HelpPanel: React.FC = () => {
  return (
    <div
      style={{
        padding: '1rem',
        fontSize: '0.875rem',
        color: '#888',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <h3
        style={{
          color: colors.primary,
          marginBottom: '0.5rem',
          fontSize: '1rem',
        }}
      >
        Controls
      </h3>

      <p style={{ marginBottom: '0.5rem' }}>
        <strong>Canvas:</strong>
      </p>
      <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
        <li>Scroll to zoom</li>
        <li>Click and drag to pan</li>
        <li>Double-click to reset view</li>
      </ul>

      <p style={{ marginBottom: '0.5rem' }}>
        <strong>Patch:</strong>
      </p>
      <ul style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
        <li>Click blocks in table to inspect</li>
        <li>Expand rows to see ports and connections</li>
        <li>Click connections to navigate</li>
        <li>Click block type in library to preview</li>
        <li>Double-click block type to add to patch</li>
      </ul>
    </div>
  );
};
