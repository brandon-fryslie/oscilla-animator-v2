/**
 * Block Registration Aggregator
 *
 * Registers all block declarations explicitly, then activates them in the live registry.
 */

import { activateDeclaredBlocks, resetDeclaredBlocks } from './registry';
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

/**
 * Explicitly activate all declared blocks in the live registry.
 */
export function registerAllBlocks(): void {
  // [LAW:one-source-of-truth] Primitive block catalog is rebuilt from source
  // registrations every invocation (including HMR refresh paths).
  resetDeclaredBlocks();
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
}
