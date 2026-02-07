/**
 * Type Formatting Utilities
 *
 * Shared formatters for displaying CanonicalType in UI components.
 */

import type { InferenceCanonicalType } from '../../core/inference-types';

/**
 * Format a CanonicalType for display, non-throwing, shows unit if meaningful.
 */
export function formatSignalType(type: InferenceCanonicalType | undefined): string {
  if (!type) return 'unknown';

  const payload = type.payload.kind;
  const unit = type.unit;

  let unitStr = '';
  switch (unit.kind) {
    case 'none':
      unitStr = '';
      break;
    case 'scalar':
      unitStr = '0..1';
      break;
    case 'count':
      unitStr = '#';
      break;
    case 'angle':
      switch (unit.unit) {
        case 'turns':
          unitStr = 'phase';
          break;
        case 'radians':
          unitStr = 'rad';
          break;
        case 'degrees':
          unitStr = 'deg';
          break;
      }
      break;
    case 'time':
      switch (unit.unit) {
        case 'ms':
          unitStr = 'ms';
          break;
        case 'seconds':
          unitStr = 's';
          break;
      }
      break;
    case 'space':
      switch (unit.unit) {
        case 'ndc':
          unitStr = 'ndc';
          break;
        case 'world':
          unitStr = 'world';
          break;
        case 'view':
          unitStr = 'view';
          break;
      }
      break;
    case 'color':
      unitStr = 'rgba';
      break;
    default:
      unitStr = '';
      break;
  }

  return unitStr ? `${payload}:${unitStr}` : payload;
}
