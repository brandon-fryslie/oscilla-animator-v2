/**
 * Settings System Public API
 *
 * Exports:
 * - defineSettings: Factory function to create settings tokens
 * - useSettings: React hook for typed, reactive settings access
 * - Types: SettingsToken, FieldUIHint, SettingsUIConfig, FieldControlType
 *
 * NOTE: Individual settings tokens are NOT exported from this barrel.
 * Features must import their own tokens directly from their owning module.
 * This enforces the ownership model and prevents cross-feature dependencies.
 */

export { defineSettings } from './defineSettings';
export { useSettings } from './useSettings';
export type {
  SettingsToken,
  FieldUIHint,
  SettingsUIConfig,
  FieldControlType,
} from './types';
