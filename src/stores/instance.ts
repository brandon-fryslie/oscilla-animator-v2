/**
 * Singleton RootStore Instance
 *
 * This module provides a singleton instance of RootStore for non-React code.
 * React components should use StoreProvider/useStores from context.tsx instead.
 *
 * Usage:
 *   import { rootStore } from './stores/instance';
 *   rootStore.patch.addBlock(...);
 */

import { RootStore } from './RootStore';

/**
 * Global singleton instance.
 * Created once on module import, shared across all non-React code.
 */
export const rootStore = new RootStore();
