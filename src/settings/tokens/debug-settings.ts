/**
 * Debug Settings
 *
 * Settings for debug panel and probing features.
 */

import { defineSettings } from '../defineSettings';

export interface DebugSettings {
  enabled: boolean;
}

export const debugSettings = defineSettings<DebugSettings>('debug', {
  defaults: {
    enabled: true,
  },
  ui: {
    label: 'Debug',
    description: 'Debug panel and value probing',
    order: 10,
    fields: {
      enabled: {
        label: 'Enable Debug Mode',
        description: 'Show debug panel and enable value probing on edges',
        control: 'toggle',
      },
    },
  },
});
