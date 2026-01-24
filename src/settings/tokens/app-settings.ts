/**
 * App-Level Settings
 *
 * Global application settings (e.g., default patch on load).
 */

import { defineSettings } from '../defineSettings';

export interface AppSettings {
  defaultPatchIndex: number;
}

export const appSettings = defineSettings<AppSettings>('app', {
  defaults: {
    defaultPatchIndex: 0, // Default to first patch (Golden Spiral)
  },
  ui: {
    label: 'Application',
    description: 'Global application settings',
    order: 0,
    fields: {
      defaultPatchIndex: {
        label: 'Default Patch',
        description: 'Patch to load on startup (requires page reload)',
        control: 'number',
        min: 0,
        step: 1,
      },
    },
  },
});
