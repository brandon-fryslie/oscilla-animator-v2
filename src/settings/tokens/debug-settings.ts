/**
 * Debug Settings
 *
 * Settings for debug panel and probing features.
 */

import { defineSettings } from '../defineSettings';

export interface DebugSettings extends Record<string, unknown> {
  enabled: boolean;
  traceCardinalitySolver: boolean;
  assertPhaseBoundaryStateReads: boolean;
}

export const debugSettings = defineSettings<DebugSettings>('debug', {
  defaults: {
    enabled: true,
    traceCardinalitySolver: false,
    assertPhaseBoundaryStateReads: false,
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
      assertPhaseBoundaryStateReads: {
        label: 'Assert Phase Boundary (State)',
        description: 'Debug assertion: fail when schedule mixes phase-2 state writes before phase-1 reads',
        control: 'toggle',
      },
    },
  },
});
