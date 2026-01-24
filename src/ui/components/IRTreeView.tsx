/**
 * IRTreeView Component
 *
 * Collapsible tree view for displaying IR structures.
 * Supports:
 * - Default expand depth (1 level)
 * - Click to select nodes
 * - Highlight search matches
 * - Handle complex types (Maps, Sets, arrays, objects)
 */

import React, { useState, useCallback, useMemo } from 'react';
import { colors } from '../theme';
import './CompilationInspector.css';

/** Serialized Map from IR JSON serialization */
interface SerializedMap {
  __type: 'Map';
  entries: Record<string, unknown>;
}

/** Serialized Set from IR JSON serialization */
interface SerializedSet {
  __type: 'Set';
  values: unknown[];
}

function isSerializedMap(value: object): value is SerializedMap {
  return '__type' in value && (value as SerializedMap).__type === 'Map';
}

function isSerializedSet(value: object): value is SerializedSet {
  return '__type' in value && (value as SerializedSet).__type === 'Set';
}

export interface IRTreeViewProps {
  /** IR data to display */
  data: unknown;

  /** Default expand depth (default: 1) */
  defaultExpandDepth?: number;

  /** Callback when node is clicked */
  onNodeSelect?: (path: string[], value: unknown) => void;

  /** Paths to highlight (for search results) */
  highlightPaths?: string[][];
}

/**
 * IRTreeView component.
 * Displays IR as a collapsible tree.
 */
export const IRTreeView: React.FC<IRTreeViewProps> = ({
  data,
  defaultExpandDepth = 1,
  onNodeSelect,
  highlightPaths = [],
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Build path string for comparison
  const pathToString = useCallback((path: string[]): string => {
    return path.join('.');
  }, []);

  // Check if path should be highlighted
  const isHighlighted = useCallback(
    (path: string[]): boolean => {
      const pathStr = pathToString(path);
      return highlightPaths.some((hp) => pathToString(hp) === pathStr);
    },
    [highlightPaths, pathToString]
  );

  // Toggle node expansion
  const toggleExpand = useCallback((path: string[]) => {
    const pathStr = pathToString(path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathStr)) {
        next.delete(pathStr);
      } else {
        next.add(pathStr);
      }
      return next;
    });
  }, [pathToString]);

  // Check if path is expanded
  const isExpanded = useCallback(
    (path: string[]): boolean => {
      return expandedPaths.has(pathToString(path));
    },
    [expandedPaths, pathToString]
  );

  // Auto-expand based on depth
  const shouldAutoExpand = useCallback((path: string[], depth: number): boolean => {
    return depth < defaultExpandDepth;
  }, [defaultExpandDepth]);

  return (
    <div className="ir-tree-view">
      <TreeNode
        value={data}
        path={[]}
        depth={0}
        isExpanded={isExpanded}
        shouldAutoExpand={shouldAutoExpand}
        toggleExpand={toggleExpand}
        onNodeSelect={onNodeSelect}
        isHighlighted={isHighlighted}
      />
    </div>
  );
};

// =============================================================================
// TreeNode Component
// =============================================================================

interface TreeNodeProps {
  value: unknown;
  path: string[];
  depth: number;
  isExpanded: (path: string[]) => boolean;
  shouldAutoExpand: (path: string[], depth: number) => boolean;
  toggleExpand: (path: string[]) => void;
  onNodeSelect?: (path: string[], value: unknown) => void;
  isHighlighted: (path: string[]) => boolean;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  value,
  path,
  depth,
  isExpanded,
  shouldAutoExpand,
  toggleExpand,
  onNodeSelect,
  isHighlighted,
}) => {
  const expanded = isExpanded(path) || shouldAutoExpand(path, depth);
  const highlighted = isHighlighted(path);

  // Determine node type
  const nodeType = getNodeType(value);

  // Handle leaf nodes (primitives, null, circular refs, functions)
  if (nodeType === 'primitive' || nodeType === 'null' || nodeType === 'circular' || nodeType === 'function') {
    return (
      <div
        className={`tree-node tree-node-leaf ${highlighted ? 'tree-node-highlighted' : ''}`}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => onNodeSelect?.(path, value)}
      >
        <span className="tree-node-value">{formatValue(value)}</span>
      </div>
    );
  }

  // Handle container nodes (objects, arrays, Maps, Sets)
  const children = getChildren(value);
  const isEmpty = children.length === 0;

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleExpand(path);
    },
    [path, toggleExpand]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onNodeSelect?.(path, value);
    },
    [path, value, onNodeSelect]
  );

  return (
    <div className="tree-node tree-node-container">
      <div
        className={`tree-node-header ${highlighted ? 'tree-node-highlighted' : ''}`}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={handleClick}
      >
        {!isEmpty && (
          <button
            className="tree-node-toggle"
            onClick={handleToggle}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}
        {isEmpty && <span className="tree-node-toggle tree-node-toggle-empty"></span>}
        <span className="tree-node-key">{getNodeLabel(value, children.length)}</span>
      </div>
      {expanded && !isEmpty && (
        <div className="tree-node-children">
          {children.map(({ key, value: childValue }, idx) => (
            <TreeNodeChild
              key={`${key}-${idx}`}
              nodeKey={key}
              value={childValue}
              path={[...path, key]}
              depth={depth + 1}
              isExpanded={isExpanded}
              shouldAutoExpand={shouldAutoExpand}
              toggleExpand={toggleExpand}
              onNodeSelect={onNodeSelect}
              isHighlighted={isHighlighted}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// TreeNodeChild Component (displays key: value)
// =============================================================================

interface TreeNodeChildProps {
  nodeKey: string;
  value: unknown;
  path: string[];
  depth: number;
  isExpanded: (path: string[]) => boolean;
  shouldAutoExpand: (path: string[], depth: number) => boolean;
  toggleExpand: (path: string[]) => void;
  onNodeSelect?: (path: string[], value: unknown) => void;
  isHighlighted: (path: string[]) => boolean;
}

const TreeNodeChild: React.FC<TreeNodeChildProps> = ({
  nodeKey,
  value,
  path,
  depth,
  isExpanded,
  shouldAutoExpand,
  toggleExpand,
  onNodeSelect,
  isHighlighted,
}) => {
  const expanded = isExpanded(path) || shouldAutoExpand(path, depth);
  const highlighted = isHighlighted(path);
  const nodeType = getNodeType(value);

  // Leaf node
  if (nodeType === 'primitive' || nodeType === 'null' || nodeType === 'circular' || nodeType === 'function') {
    return (
      <div
        className={`tree-node tree-node-leaf ${highlighted ? 'tree-node-highlighted' : ''}`}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => onNodeSelect?.(path, value)}
      >
        <span className="tree-node-key">{nodeKey}:</span>
        <span className="tree-node-value">{formatValue(value)}</span>
      </div>
    );
  }

  // Container node
  const children = getChildren(value);
  const isEmpty = children.length === 0;

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleExpand(path);
    },
    [path, toggleExpand]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onNodeSelect?.(path, value);
    },
    [path, value, onNodeSelect]
  );

  return (
    <div className="tree-node tree-node-container">
      <div
        className={`tree-node-header ${highlighted ? 'tree-node-highlighted' : ''}`}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={handleClick}
      >
        {!isEmpty && (
          <button
            className="tree-node-toggle"
            onClick={handleToggle}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}
        {isEmpty && <span className="tree-node-toggle tree-node-toggle-empty"></span>}
        <span className="tree-node-key">{nodeKey}:</span>
        <span className="tree-node-type">{getNodeLabel(value, children.length)}</span>
      </div>
      {expanded && !isEmpty && (
        <div className="tree-node-children">
          {children.map(({ key, value: childValue }, idx) => (
            <TreeNodeChild
              key={`${key}-${idx}`}
              nodeKey={key}
              value={childValue}
              path={[...path, key]}
              depth={depth + 1}
              isExpanded={isExpanded}
              shouldAutoExpand={shouldAutoExpand}
              toggleExpand={toggleExpand}
              onNodeSelect={onNodeSelect}
              isHighlighted={isHighlighted}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

type NodeType = 'primitive' | 'null' | 'circular' | 'function' | 'object' | 'array' | 'map' | 'set';

function getNodeType(value: unknown): NodeType {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' && value === '[Circular]') return 'circular';
  if (typeof value === 'string' && value === '[Function]') return 'function';
  if (typeof value !== 'object') return 'primitive';

  // Check for serialized Map/Set
  if (typeof value === 'object' && '__type' in value) {
    const typed = value as { __type: string };
    if (typed.__type === 'Map') return 'map';
    if (typed.__type === 'Set') return 'set';
  }

  if (Array.isArray(value)) return 'array';
  return 'object';
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    // Special markers
    if (value === '[Circular]') return '↻ [Circular]';
    if (value === '[Function]') return 'ƒ [Function]';
    // Regular strings - truncate if too long
    if (value.length > 100) {
      return `"${value.slice(0, 97)}..."`;
    }
    return `"${value}"`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  return String(value);
}

function getNodeLabel(value: unknown, childCount: number): string {
  const type = getNodeType(value);

  switch (type) {
    case 'object':
      return childCount === 0 ? '{}' : `{ ${childCount} }`;
    case 'array':
      return childCount === 0 ? '[]' : `[ ${childCount} ]`;
    case 'map':
      return childCount === 0 ? 'Map {}' : `Map { ${childCount} }`;
    case 'set':
      return childCount === 0 ? 'Set []' : `Set [ ${childCount} ]`;
    default:
      return String(value);
  }
}

interface ChildEntry {
  key: string;
  value: unknown;
}

function getChildren(value: unknown): ChildEntry[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [];

  // Serialized Map
  if (isSerializedMap(value)) {
    return Object.entries(value.entries).map(([k, v]) => ({ key: k, value: v }));
  }

  // Serialized Set
  if (isSerializedSet(value)) {
    return value.values.map((v, idx) => ({ key: String(idx), value: v }));
  }

  // Array
  if (Array.isArray(value)) {
    return value.map((v, idx) => ({ key: String(idx), value: v }));
  }

  // Object
  return Object.entries(value).map(([k, v]) => ({ key: k, value: v }));
}
