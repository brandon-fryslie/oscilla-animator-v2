/**
 * src/pillars/blocks/index.ts
 *
 * Side-effect imports that register all pillar block types at module load.
 * Consumers should import this module once (e.g. from the compiler-tester
 * app or the test setup) to populate the registry before compiling patches.
 */

import './particle-pool';
import './expression-modifier';
import './draw-bundle';
