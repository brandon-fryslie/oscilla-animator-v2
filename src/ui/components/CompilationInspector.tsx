/**
 * CompilationInspector Component
 *
 * Main UI for inspecting compiler pipeline passes.
 * Shows:
 * - Pass selector (tabs for 7 passes)
 * - Tree view of selected pass output
 * - Node detail panel
 * - Search functionality
 * - Raw JSON toggle
 * - Pass timing information
 *
 * Sprint: debugging-toolkit / compilation-inspector
 */

import React, { useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { Tabs, Tab, TextField, InputAdornment, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { compilationInspector } from '../../services/CompilationInspectorService';
import { IRTreeView } from './IRTreeView';
import { IRNodeDetail } from './IRNodeDetail';
import { colors } from '../theme';
import './CompilationInspector.css';

/**
 * CompilationInspector component.
 * Observes CompilationInspectorService for reactive updates.
 */
export const CompilationInspector: React.FC = observer(() => {
  const [selectedPassIndex, setSelectedPassIndex] = useState(0);
  const [showRawJSON, setShowRawJSON] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<{ path: string[]; value: unknown } | null>(null);

  // Get latest snapshot
  const snapshot = compilationInspector.getLatestSnapshot();

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return compilationInspector.search(searchQuery.trim());
  }, [searchQuery]);

  // Highlight paths for current pass
  const highlightPaths = useMemo(() => {
    if (!snapshot || searchResults.length === 0) return [];
    const currentPass = snapshot.passes[selectedPassIndex];
    if (!currentPass) return [];

    return searchResults
      .filter((r) => r.passName === currentPass.passName)
      .map((r) => r.path);
  }, [snapshot, selectedPassIndex, searchResults]);

  // Handle pass tab change
  const handlePassChange = useCallback((_event: React.SyntheticEvent, newValue: number) => {
    setSelectedPassIndex(newValue);
    setSelectedNode(null); // Clear selection when switching passes
  }, []);

  // Handle node selection
  const handleNodeSelect = useCallback((path: string[], value: unknown) => {
    setSelectedNode({ path, value });
  }, []);

  // Handle search clear
  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  // No snapshots yet
  if (!snapshot) {
    return (
      <div className="compilation-inspector">
        <div className="compilation-inspector-empty">
          <p style={{ color: colors.textSecondary }}>No compilation data yet.</p>
          <p style={{ color: colors.textMuted, fontSize: '13px' }}>
            Make a change to the patch to trigger compilation.
          </p>
        </div>
      </div>
    );
  }

  // Get current pass
  const currentPass = snapshot.passes[selectedPassIndex];
  if (!currentPass) {
    return (
      <div className="compilation-inspector">
        <div className="compilation-inspector-empty">
          <p style={{ color: colors.error }}>Pass not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="compilation-inspector">
      {/* Header with snapshot info */}
      <div className="compilation-inspector-header">
        <div className="compilation-inspector-header-info">
          <div className="compilation-inspector-compile-id">
            Compilation: <span>{snapshot.compileId}</span>
          </div>
          <div className="compilation-inspector-status">
            Status:{' '}
            <span className={`status-badge status-${snapshot.status}`}>
              {snapshot.status}
            </span>
          </div>
          <div className="compilation-inspector-duration">
            Total: <span>{snapshot.totalDurationMs.toFixed(1)}ms</span>
          </div>
        </div>
      </div>

      {/* Pass selector tabs */}
      <div className="compilation-inspector-tabs">
        <Tabs
          value={selectedPassIndex}
          onChange={handlePassChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              padding: '8px 16px',
              fontSize: '0.813rem',
            },
          }}
        >
          {snapshot.passes.map((pass, idx) => (
            <Tab
              key={pass.passName}
              label={
                <div className="pass-tab-label">
                  <span className="pass-tab-number">{pass.passNumber}</span>
                  <span className="pass-tab-name">{pass.passName}</span>
                  <span className="pass-tab-duration">{pass.durationMs.toFixed(1)}ms</span>
                </div>
              }
            />
          ))}
        </Tabs>
      </div>

      {/* Search bar */}
      <div className="compilation-inspector-search">
        <TextField
          size="small"
          fullWidth
          placeholder="Search by ID, key, or value..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: colors.textSecondary }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleSearchClear}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '0.813rem',
            },
          }}
        />
        {searchResults.length > 0 && (
          <div className="search-result-count">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Current pass info */}
      <div className="compilation-inspector-pass-info">
        <div className="pass-info-row">
          <span className="pass-info-label">Pass:</span>
          <span className="pass-info-value">
            {currentPass.passNumber}. {currentPass.passName}
          </span>
        </div>
        <div className="pass-info-row">
          <span className="pass-info-label">Duration:</span>
          <span className="pass-info-value">{currentPass.durationMs.toFixed(2)}ms</span>
        </div>
        <div className="pass-info-row">
          <span className="pass-info-label">Output Size:</span>
          <span className="pass-info-value">
            {formatBytes(currentPass.outputSize)}
          </span>
        </div>
        {currentPass.errors.length > 0 && (
          <div className="pass-info-row pass-info-errors">
            <span className="pass-info-label">Errors:</span>
            <span className="pass-info-value pass-info-error-count">
              {currentPass.errors.length}
            </span>
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="compilation-inspector-toggle">
        <button
          className={`toggle-button ${!showRawJSON ? 'toggle-button-active' : ''}`}
          onClick={() => setShowRawJSON(false)}
        >
          Tree View
        </button>
        <button
          className={`toggle-button ${showRawJSON ? 'toggle-button-active' : ''}`}
          onClick={() => setShowRawJSON(true)}
        >
          Raw JSON
        </button>
      </div>

      {/* Content area */}
      <div className="compilation-inspector-content">
        {showRawJSON ? (
          <div className="compilation-inspector-json">
            <pre>{JSON.stringify(currentPass.output, null, 2)}</pre>
          </div>
        ) : (
          <div className="compilation-inspector-tree-container">
            {/* Tree view */}
            <div className="compilation-inspector-tree">
              <IRTreeView
                data={currentPass.output}
                defaultExpandDepth={1}
                onNodeSelect={handleNodeSelect}
                highlightPaths={highlightPaths}
              />
            </div>

            {/* Node detail panel (if node selected) */}
            {selectedNode && (
              <div className="compilation-inspector-detail">
                <IRNodeDetail
                  path={selectedNode.path}
                  value={selectedNode.value}
                  onClose={() => setSelectedNode(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Errors section */}
      {currentPass.errors.length > 0 && (
        <div className="compilation-inspector-errors">
          <h4>Errors ({currentPass.errors.length})</h4>
          {currentPass.errors.map((error, idx) => (
            <div key={idx} className="compilation-error">
              <div className="compilation-error-message">{error.message}</div>
              {error.blockId && (
                <div className="compilation-error-location">Block: {error.blockId}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
