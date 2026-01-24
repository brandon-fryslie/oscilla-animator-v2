/**
 * Settings System Type Definitions
 *
 * Type-safe settings tokens with UI metadata.
 * Tokens are immutable and scoped to a namespace.
 */

/**
 * UI control type for a settings field.
 */
export type FieldControlType = 'toggle' | 'number' | 'select' | 'text' | 'slider';

/**
 * UI hint for rendering a single settings field.
 */
export interface FieldUIHint {
  /** Display label for the field */
  label: string;
  /** Optional description/help text */
  description?: string;
  /** Control type to render */
  control: FieldControlType;
  /** Options for select control */
  options?: Array<{ label: string; value: unknown }>;
  /** Min value for number/slider */
  min?: number;
  /** Max value for number/slider */
  max?: number;
  /** Step size for number/slider */
  step?: number;
}

/**
 * UI configuration for all fields in a settings namespace.
 * Maps field keys to their UI hints.
 */
export interface SettingsUIConfig<T extends Record<string, unknown>> {
  /** Display label for this settings section */
  label: string;
  /** Optional description for the section */
  description?: string;
  /** Sort order in settings panel (lower = higher in list) */
  order: number;
  /** UI hints for each field */
  fields: {
    [K in keyof T]: FieldUIHint;
  };
}

/**
 * Immutable settings token.
 * Carries the settings shape as a generic parameter.
 *
 * Brand prevents accidental cross-token usage.
 */
export interface SettingsToken<T extends Record<string, unknown>> {
  readonly namespace: string;
  readonly defaults: Readonly<T>;
  readonly ui: SettingsUIConfig<T>;
  readonly __brand: 'SettingsToken';
}
