/**
 * Block Registration Aggregator
 *
 * Registers all block declarations explicitly, then activates them in the live registry.
 */

import { activateDeclaredBlocks } from './registry';
import { registerTimeBlocks } from './time';
import { registerScalarBlocks } from './scalar';
import { registerMathBlocks } from './math';
import { registerFieldBlocks } from './field';
import { registerShapeBlocks } from './shape';
import { registerLayoutBlocks } from './layout';
import { registerColorBlocks } from './color';
import { registerAdapterBlocks } from './adapter';
import { registerLensBlocks } from './lens';
import { registerEventBlocks } from './event';
import { registerIoBlocks } from './io';
import { registerRenderBlocks } from './render';
import { registerDomainBlocks } from './domain';
import { registerInstanceBlocks } from './instance';
import { registerDevBlocks } from './dev';

let didRegisterAllBlocks = false;

/**
 * Explicitly activate all declared blocks in the live registry.
 */
export function registerAllBlocks(): void {
  if (didRegisterAllBlocks) return;
  registerTimeBlocks();
  registerScalarBlocks();
  registerMathBlocks();
  registerFieldBlocks();
  registerShapeBlocks();
  registerLayoutBlocks();
  registerColorBlocks();
  registerAdapterBlocks();
  registerLensBlocks();
  registerEventBlocks();
  registerIoBlocks();
  registerRenderBlocks();
  registerDomainBlocks();
  registerInstanceBlocks();
  registerDevBlocks();
  activateDeclaredBlocks();
  didRegisterAllBlocks = true;
}
