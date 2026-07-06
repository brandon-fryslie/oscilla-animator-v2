/**
 * BlockCatalogContext - injects the era's BlockCatalog into the editor tree.
 *
 * Parallel to how the GraphDataAdapter is era-selected: the V1 boot provides the
 * V1 registry projection, the native boot provides the scene registry
 * projection, and the consumers (block library, connection picker, replacement
 * menu) read whichever one is in scope via `useBlockCatalog()` — none of them
 * knows which backend it is browsing. [LAW:one-way-deps]
 */

import React, { createContext, useContext } from 'react';
import type { BlockCatalog } from './block-catalog';

const BlockCatalogContext = createContext<BlockCatalog | null>(null);

export const BlockCatalogProvider: React.FC<{
  catalog: BlockCatalog;
  children: React.ReactNode;
}> = ({ catalog, children }) => (
  <BlockCatalogContext.Provider value={catalog}>{children}</BlockCatalogContext.Provider>
);

/**
 * Read the in-scope catalog. Throws when no provider is present rather than
 * silently falling back to one era — a missing provider is a wiring bug, not a
 * default. [LAW:no-silent-failure]
 */
export function useBlockCatalog(): BlockCatalog {
  const catalog = useContext(BlockCatalogContext);
  if (!catalog) {
    throw new Error('useBlockCatalog must be used within a BlockCatalogProvider');
  }
  return catalog;
}
