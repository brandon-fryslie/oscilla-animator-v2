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

import { useEffect } from 'react';
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

  // Auto-register token on first use (idempotent)
  useEffect(() => {
    settingsStore.register(token);
  }, [settingsStore, token]);

  // Get current values (observable)
  const values = settingsStore.get(token);

  // Create update function
  const update = (partial: Partial<T>) => {
    settingsStore.update(token, partial);
  };

  return [values, update];
}
