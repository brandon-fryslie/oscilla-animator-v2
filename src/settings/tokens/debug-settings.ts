/**
 * Debug Settings
 *
 * Settings for debug panel and probing features.
 */

import { defineSettings } from '../defineSettings';

export interface DebugSettings extends Record<string, unknown> {
  enabled: boolean;
  traceCardinalitySolver: boolean;
  useFixpointFrontend: boolean;
}

export const debugSettings = defineSettings<DebugSettings>('debug', {
  defaults: {
    enabled: true,
    traceCardinalitySolver: false,
    useFixpointFrontend: true,
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
      useFixpointFrontend: {
        label: 'Use Fixpoint Frontend (V2)',
        description: 'Use the iterative fixpoint normalization engine instead of the linear pass chain',
        control: 'toggle',
      },
    },
  },
});
