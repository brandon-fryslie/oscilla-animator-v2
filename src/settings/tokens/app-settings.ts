/**
 * App-Level Settings
 *
 * Global application settings (e.g., default patch on load).
 */

import { defineSettings } from '../defineSettings';

export interface AppSettings extends Record<string, unknown> {
  defaultPatchIndex: number;
}

export const appSettings = defineSettings<AppSettings>('app', {
  defaults: {
    defaultPatchIndex: 0, // Default to Simple (matches DEFAULT_PATCH_INDEX in main.ts)
  },
  ui: {
    label: 'Application',
    description: 'Global application settings',
    order: 0,
    fields: {
      defaultPatchIndex: {
        label: 'Default Patch',
        description: 'Patch to load on startup when no saved patch exists (requires page reload)',
        control: 'number',
        min: 0,
        max: 9,
        step: 1,
      },
    },
  },
});
