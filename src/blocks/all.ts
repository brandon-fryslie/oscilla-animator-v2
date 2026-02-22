/**
 * Block Registration Aggregator
 *
 * Imports all block declarations, then exposes an explicit registration function.
 */

import { activateDeclaredBlocks } from './registry';

// Primitive block categories
import './time';
import './scalar';
import './math';
import './field';
import './shape';
import './layout';
import './color';
import './adapter';
import './lens';
import './event';
import './io';
import './render';
import './domain';
import './instance';
import './dev';

// Composite block library
import './composites';

let didRegisterAllBlocks = false;

/**
 * Explicitly activate all declared blocks in the live registry.
 */
export function registerAllBlocks(): void {
  if (didRegisterAllBlocks) return;
  activateDeclaredBlocks();
  didRegisterAllBlocks = true;
}
