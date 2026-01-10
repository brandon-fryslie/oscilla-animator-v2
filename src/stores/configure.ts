/**
 * MobX Configuration - Strict Mode Enforcement
 *
 * This module configures MobX to enforce architectural constraints:
 * - All mutations must occur inside actions
 * - Computed values must be used within reactions
 * - Reactions must observe observables
 *
 * Import this before creating any stores.
 */

import { configure } from 'mobx';

/**
 * Enable strict mode for MobX.
 * This prevents common mistakes that violate the store architecture:
 * - Mutations outside actions (prevents scattered state changes)
 * - Unused computeds (prevents unnecessary computation)
 * - Non-reactive reactions (prevents silent bugs)
 */
export function configureMobX(): void {
  configure({
    enforceActions: 'always',
    computedRequiresReaction: true,
    reactionRequiresObservable: true,
  });
}
