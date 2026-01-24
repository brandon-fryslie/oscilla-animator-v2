/**
 * useSettings Hook
 *
 * React hook for typed, reactive settings access.
 *
 * Usage:
 * ```typescript
 * const [values, update] = useSettings(debugSettings);
 * // values.enabled is typed and reactive
 * update({ enabled: true }); // partial update
 * ```
 *
 * Requirements:
 * - Component must be wrapped with observer() from mobx-react-lite
 * - Must be used within StoreProvider context
 *
 * Auto-registers the token on first use (idempotent).
 */

import { useCallback } from 'react';
import { useStore } from '../stores';
import type { SettingsToken } from './types';

/**
 * Hook to access settings for a specific token.
 *
 * @param token - Settings token
 * @returns [values, update] tuple where:
 *   - values: Observable settings object (typed as T)
 *   - update: Function to apply partial updates
 */
export function useSettings<T extends Record<string, unknown>>(
  token: SettingsToken<T>
): [T, (partial: Partial<T>) => void] {
  const settingsStore = useStore('settings');

  // Register synchronously — idempotent, safe to call on every render.
  // Must happen before get() to ensure the token is in the registry.
  settingsStore.register(token);

  // Get current values (observable)
  const values = settingsStore.get(token);

  // Stable update function
  const update = useCallback(
    (partial: Partial<T>) => {
      settingsStore.update(token, partial);
    },
    [settingsStore, token]
  );

  return [values, update];
}
