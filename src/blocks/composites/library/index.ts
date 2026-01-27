/**
 * Library Composites Index
 *
 * Exports all predefined library composites.
 * These are registered during app startup.
 */

export { SmoothNoiseComposite } from './smooth-noise';
export { PingPongComposite } from './ping-pong';
export { ColorCycleComposite } from './color-cycle';
export { DelayedTriggerComposite } from './delayed-trigger';

import type { CompositeBlockDef } from '../../composite-types';
import { SmoothNoiseComposite } from './smooth-noise';
import { PingPongComposite } from './ping-pong';
import { ColorCycleComposite } from './color-cycle';
import { DelayedTriggerComposite } from './delayed-trigger';

/**
 * All library composites as an array for bulk registration.
 * All library composites have readonly: true set.
 */
export const LIBRARY_COMPOSITES: readonly CompositeBlockDef[] = [
  SmoothNoiseComposite,
  PingPongComposite,
  ColorCycleComposite,
  DelayedTriggerComposite,
] as const;
