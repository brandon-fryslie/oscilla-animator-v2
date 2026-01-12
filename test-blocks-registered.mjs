/**
 * Quick test to verify all blocks used in main.ts are registered
 */

// Import all block registrations (side effects)
import '../src/blocks/time-blocks.js';
import '../src/blocks/signal-blocks.js';
import '../src/blocks/domain-blocks.js';
import '../src/blocks/field-blocks.js';
import '../src/blocks/math-blocks.js';
import '../src/blocks/color-blocks.js';
import '../src/blocks/geometry-blocks.js';
import '../src/blocks/identity-blocks.js';
import '../src/blocks/render-blocks.js';
import '../src/blocks/field-operations-blocks.js';

import { getAllBlockTypes, getBlockDefinition } from '../src/blocks/registry.js';

const types = getAllBlockTypes();
console.log(`\nRegistered ${types.length} block types:\n`);

// Check specific types from main.ts
const needed = [
  'InfiniteTimeRoot',
  'DomainN',
  'FieldFromDomainId',
  'ConstFloat',
  'FieldPulse',
  'FieldGoldenAngle',
  'FieldAngularOffset',
  'FieldAdd',
  'FieldRadiusSqrt',
  'FieldPolarToCartesian',
  'FieldJitter2D',
  'FieldHueFromPhase',
  'HsvToRgb',
  'RenderInstances2D'
];

console.log('Blocks used in main.ts:');
let allRegistered = true;
for (const type of needed) {
  const def = getBlockDefinition(type);
  const hasLower = def && typeof def.lower === 'function';
  const status = hasLower ? '✓' : '✗';
  console.log(`  ${status} ${type}${hasLower ? ' (has lower)' : ' (MISSING or no lower)'}`);
  if (!hasLower) allRegistered = false;
}

console.log(`\n${allRegistered ? 'SUCCESS: All blocks registered with lower functions!' : 'FAILURE: Some blocks missing or lack lower functions!'}`);
process.exit(allRegistered ? 0 : 1);
