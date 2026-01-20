/**
 * InspectorContainer - Pure presentational component for inspector panels
 *
 * Provides a consistent layout for inspector panels with:
 * - Color-coded left border
 * - Header with title, optional category badge, and optional type code
 * - Optional back button
 * - Body section for children
 */

import React, { type ReactNode } from 'react';
import { IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import './InspectorContainer.css';

export interface InspectorContainerProps {
  /** Main title text */
  title: string;

  /** Optional type code (e.g., "OSC", "ENV") shown in header */
  typeCode?: string;

  /** Optional category badge (e.g., "Source", "Effect") */
  category?: string;

  /** Color for left border accent (hex or CSS color) */
  color?: string;

  /** Optional back button handler */
  onBack?: () => void;

  /** Label for back button (default: "Back") */
  backLabel?: string;

  /** Inspector content */
  children: ReactNode;

  /** Additional CSS class names */
  className?: string;
}

/**
 * InspectorContainer component
 *
 * Pure React component for displaying inspector panels with consistent styling.
 */
export const InspectorContainer: React.FC<InspectorContainerProps> = ({
  title,
  typeCode,
  category,
  color = '#4ecdc4',
  onBack,
  backLabel = 'Back',
  children,
  className = '',
}) => {
  return (
    <div
      className={`inspector-container ${className}`}
      style={{ '--inspector-accent-color': color } as React.CSSProperties}
    >
      {/* Optional back button */}
      {onBack && (
        <div className="inspector-back">
          <IconButton
            onClick={onBack}
            size="small"
            sx={{
              color: '#888',
              fontSize: '0.875rem',
              textTransform: 'none',
              gap: '4px',
              '&:hover': {
                color: '#eee',
                background: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          >
            <ArrowBackIcon fontSize="small" />
            <span style={{ fontSize: '0.875rem' }}>{backLabel}</span>
          </IconButton>
        </div>
      )}

      {/* Header */}
      <div className="inspector-header">
        <div className="inspector-header-content">
          <h2 className="inspector-title">{title}</h2>

          <div className="inspector-header-meta">
            {category && (
              <span className="inspector-category">{category}</span>
            )}
            {typeCode && (
              <span className="inspector-type-code">{typeCode}</span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="inspector-body">
        {children}
      </div>
    </div>
  );
};
