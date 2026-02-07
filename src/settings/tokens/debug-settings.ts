/**
 * Debug Settings
 *
 * Settings for debug panel and probing features.
 */

import { defineSettings } from '../defineSettings';

export interface DebugSettings extends Record<string, unknown> {
  enabled: boolean;
  traceCardinalitySolver: boolean;
}

export const debugSettings = defineSettings<DebugSettings>('debug', {
  defaults: {
    enabled: true,
    traceCardinalitySolver: false,
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
      traceCardinalitySolver: {
        label: 'Trace Cardinality Solver',
        description: 'Log cardinality solver phases to browser console',
        control: 'toggle',
      },
    },
  },
});
