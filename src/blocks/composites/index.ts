/**
 * Composite Blocks Module
 *
 * This module handles initialization of the composite block system:
 * 1. Registers library composites (predefined, readonly)
 * 2. Loads user composites from localStorage
 *
 * Import this module during app startup to initialize composites.
 */

import { registerComposite } from '../registry';
import { compositeStorage } from './persistence';
import { jsonToCompositeBlockDef } from './loader';
import { LIBRARY_COMPOSITES } from './library';

// =============================================================================
// Exports
// =============================================================================

export * from '../composite-types';
export * from './schema';
export * from './loader';
export * from './persistence';
export { composite } from './builder';
export { LIBRARY_COMPOSITES } from './library';

// =============================================================================
// Initialization
// =============================================================================

let _initialized = false;

/**
 * Initialize the composite block system.
 * - Registers library composites
 * - Loads user composites from localStorage
 *
 * Safe to call multiple times (only runs once).
 */
export function initializeComposites(): void {
  console.log('[Composites] Starting initialization...');
  if (_initialized) {
    console.log('[Composites] Already initialized, skipping');
    return;
  }
  _initialized = true;

  // Register library composites
  let registered = 0;
  for (const composite of LIBRARY_COMPOSITES) {
    try {
      registerComposite(composite);
      registered++;
      console.log(`[Composites] Registered library composite: ${composite.type}`);
    } catch (e) {
      console.error(`Failed to register library composite ${composite.type}:`, e);
    }
  }

  // Load user composites from localStorage
  const userComposites = compositeStorage.load();
  for (const stored of userComposites.values()) {
    try {
      const def = jsonToCompositeBlockDef(stored.json);
      registerComposite(def);
    } catch (e) {
      console.warn(`Failed to load user composite ${stored.json.type}:`, e);
    }
  }

  console.log(
    `[Composites] Initialized: ${registered}/${LIBRARY_COMPOSITES.length} library, ${userComposites.size} user`
  );
}
