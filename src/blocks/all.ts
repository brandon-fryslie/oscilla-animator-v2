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
import { register as registerAttractorLayout } from './layout/attractor-layout';
import { register as registerCircleLayoutUV } from './layout/circle-layout-uv';
import { register as registerGridLayoutUV } from './layout/grid-layout-uv';
import { register as registerSpiralLayout } from './layout/spiral-layout';
import { register as registerPathLayout } from './layout/path-layout';
import { register as registerSamplePath } from './layout/sample-path';
import { register as registerScatterUV } from './layout/scatter-uv';
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
  registerAttractorLayout();
  registerCircleLayoutUV();
  registerGridLayoutUV();
  registerSpiralLayout();
  registerPathLayout();
  registerSamplePath();
  registerScatterUV();
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
