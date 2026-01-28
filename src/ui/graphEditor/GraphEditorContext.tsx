/**
 * GraphEditorContext - React Context for providing GraphDataAdapter to child components
 *
 * Following User Decision: Hybrid adapter injection pattern (Option C)
 * - GraphEditorCore receives adapter via PROPS (explicit, testable)
 * - GraphEditorCore provides adapter via React Context for children
 * - Child components (menus, nodes) consume adapter from context
 *
 * This avoids prop drilling while keeping top-level explicit.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { GraphDataAdapter } from './types';
import type { SelectionStore } from '../../stores/SelectionStore';
import type { PortHighlightStore } from '../../stores/PortHighlightStore';
import type { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import type { DebugStore } from '../../stores/DebugStore';

/**
 * Context value provided to all child components of GraphEditorCore.
 *
 * Includes:
 * - Adapter for data operations (core abstraction)
 * - Feature flags (control optional capabilities)
 * - Store references (for selection, debug, etc. - not in adapter)
 */
export interface GraphEditorContextValue {
  /** Data adapter for graph operations */
  adapter: GraphDataAdapter;

  // Feature flags
  /** Enable inline parameter editing in nodes */
  enableParamEditing: boolean;
  /** Enable debug mode (edge labels, diagnostics) */
  enableDebugMode: boolean;
  /** Enable context menus (block/edge/port) */
  enableContextMenus: boolean;

  // Store references (not part of adapter abstraction)
  /** Selection state (optional - may be null for composite editor) */
  selection: SelectionStore | null;
  /** Port highlight state (optional) */
  portHighlight: PortHighlightStore | null;
  /** Diagnostics state (optional) */
  diagnostics: DiagnosticsStore | null;
  /** Debug state (optional) */
  debug: DebugStore | null;
}

const GraphEditorContext = createContext<GraphEditorContextValue | null>(null);

/**
 * Hook to access GraphEditorContext.
 * Throws if used outside GraphEditorProvider.
 */
export function useGraphEditor(): GraphEditorContextValue {
  const ctx = useContext(GraphEditorContext);
  if (!ctx) {
    throw new Error('useGraphEditor must be used within GraphEditorProvider');
  }
  return ctx;
}

/**
 * Provider component for GraphEditorContext.
 * Should wrap all child components that need access to adapter or stores.
 */
export function GraphEditorProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: GraphEditorContextValue;
}) {
  return (
    <GraphEditorContext.Provider value={value}>
      {children}
    </GraphEditorContext.Provider>
  );
}
