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
  if (_initialized) {
    return;
  }
  _initialized = true;

  // [LAW:one-source-of-truth] Library composites are canonical startup data.
  // If registration fails, startup must fail rather than silently diverge.
  for (const composite of LIBRARY_COMPOSITES) {
    registerComposite(composite);
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
}
