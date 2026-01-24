/**
 * Settings Token Factory
 *
 * Creates typed, immutable settings tokens.
 *
 * OWNERSHIP MODEL:
 * - Each settings token is owned by the feature that uses it
 * - Tokens should live in their owning feature's directory (e.g., src/settings/tokens/debug-settings.ts)
 * - Tokens are NOT re-exported from the settings barrel (src/settings/index.ts)
 * - Features import their own token directly
 * - The settings system (SettingsStore, SettingsPanel) accesses tokens generically via registry
 *
 * This ensures one-way dependencies: features → settings system (not reverse).
 */

import type { SettingsToken, SettingsUIConfig } from './types';

/**
 * Creates a settings token with namespace, defaults, and UI config.
 *
 * The token is frozen to prevent mutation after creation.
 *
 * @param namespace - Unique identifier for this settings group (e.g., 'debug', 'editor')
 * @param config - Default values and UI metadata
 * @returns Immutable SettingsToken<T>
 *
 * @example
 * ```typescript
 * const debugSettings = defineSettings('debug', {
 *   defaults: { enabled: false },
 *   ui: {
 *     label: 'Debug',
 *     order: 100,
 *     fields: {
 *       enabled: {
 *         label: 'Debug Mode',
 *         control: 'toggle',
 *       },
 *     },
 *   },
 * });
 * ```
 */
export function defineSettings<T extends Record<string, unknown>>(
  namespace: string,
  config: {
    defaults: T;
    ui: SettingsUIConfig<T>;
  }
): SettingsToken<T> {
  const token: SettingsToken<T> = {
    namespace,
    defaults: Object.freeze({ ...config.defaults }),
    ui: config.ui,
    __brand: 'SettingsToken',
  };

  return Object.freeze(token);
}
