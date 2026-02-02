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

import { useCallback, useRef } from 'react';
import { runInAction } from 'mobx';
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

  // Register once per hook instance — must happen before get() so values exist.
  // Wrapped in runInAction to ensure observable mutations are allowed even when
  // called from within an observer component's render tracking context.
  const registeredRef = useRef(false);
  if (!registeredRef.current) {
    runInAction(() => settingsStore.register(token));
    registeredRef.current = true;
  }

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
