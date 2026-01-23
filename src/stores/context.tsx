/**
 * React Context Integration
 *
 * Provides RootStore to React component tree via context.
 * Components use useStores() hook to access stores.
 */

import React, { createContext, useContext } from 'react';
import { RootStore } from './RootStore';

const StoreContext = createContext<RootStore | null>(null);

export interface StoreProviderProps {
  children?: React.ReactNode;
  store?: RootStore; // Optional for testing
}

/**
 * Provider component that creates and provides RootStore to component tree.
 */
export function StoreProvider({ children, store }: StoreProviderProps) {
  // Create store once (or use provided store for testing)
  const rootStore = React.useMemo(() => store ?? new RootStore(), [store]);

  return (
    <StoreContext.Provider value={rootStore}>
      {children}
    </StoreContext.Provider>
  );
}

/**
 * Hook to access all stores via RootStore.
 * Must be used within StoreProvider.
 */
export function useStores(): RootStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStores must be used within StoreProvider');
  }
  return store;
}

/**
 * Convenience hook to access a specific store.
 * Example: const patch = useStore('patch');
 */
export function useStore<K extends keyof RootStore>(name: K): RootStore[K] {
  const stores = useStores();
  return stores[name];
}
