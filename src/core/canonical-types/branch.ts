/**
 * Branch Axis — Which parallel universe?
 *
 * default: main execution branch
 * specific: a particular parallel branch
 */

import type { BranchVarId } from '../ids.js';
import type { Axis } from './axis';
import type { InstanceRef } from './instance-ref';

// =============================================================================
// Types
// =============================================================================

export type BranchValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };

export type Branch = Axis<BranchValue, BranchVarId>;

export const DEFAULT_BRANCH: BranchValue = { kind: 'default' };
