/**
 * SelectionDetailContext — injects the era's SelectionDetail into the inspector tree.
 *
 * Parallel to how BlockCatalog is era-selected: the V1 boot provides the V1
 * store-backed detail, the native boot provides the scene detail, and the
 * inspector panels (block inspector, edge inspector) read whichever one is in
 * scope via `useSelectionDetail()` — none of them knows which backend it is
 * inspecting. Unlike the canvas seams (adapter / oracle / decorator, threaded
 * through GraphEditorContext to GraphEditorCore's children), the inspectors are
 * dockview panels OUTSIDE the core, so this context is provided at the boot shell
 * — the same level BlockCatalogProvider sits at. [LAW:one-way-deps]
 */

import React, { createContext, useContext } from 'react';
import type { SelectionDetail } from './selection-detail';

const SelectionDetailContext = createContext<SelectionDetail | null>(null);

export const SelectionDetailProvider: React.FC<{
  detail: SelectionDetail;
  children: React.ReactNode;
}> = ({ detail, children }) => (
  <SelectionDetailContext.Provider value={detail}>{children}</SelectionDetailContext.Provider>
);

/**
 * Read the in-scope selection detail. Throws when no provider is present rather
 * than silently falling back to one era — a missing provider is a wiring bug, not
 * a default. [LAW:no-silent-failure]
 */
export function useSelectionDetail(): SelectionDetail {
  const detail = useContext(SelectionDetailContext);
  if (!detail) {
    throw new Error('useSelectionDetail must be used within a SelectionDetailProvider');
  }
  return detail;
}
