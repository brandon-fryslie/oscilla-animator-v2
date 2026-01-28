/**
 * Demo Patch Library
 *
 * Collection of pre-built demo patches showcasing Oscilla capabilities.
 * Each patch is a self-contained example with its own visual style and features.
 */

export { type PatchBuilder } from './types';
export { patchGoldenSpiral } from './golden-spiral';
export { patchDomainTest } from './domain-test';
export { patchTileGrid } from './tile-grid';
export { patchOrbitalRings } from './orbital-rings';
export { patchRectMosaic } from './rect-mosaic';
export { patchShapeKaleidoscope } from './shape-kaleidoscope';
export { patchPerspectiveCamera } from './perspective-camera';
export { patchFeedbackRotation } from './feedback-rotation';
export { patchFeedbackSimple } from './feedback-simple';
export { patchPathFieldDemo } from './path-field-demo';
export { patchErrorIsolationDemo } from './error-isolation-demo';

import { patchGoldenSpiral } from './golden-spiral';
import { patchDomainTest } from './domain-test';
import { patchTileGrid } from './tile-grid';
import { patchOrbitalRings } from './orbital-rings';
import { patchRectMosaic } from './rect-mosaic';
import { patchShapeKaleidoscope } from './shape-kaleidoscope';
import { patchPerspectiveCamera } from './perspective-camera';
import { patchFeedbackRotation } from './feedback-rotation';
import { patchFeedbackSimple } from './feedback-simple';
import { patchPathFieldDemo } from './path-field-demo';
import { patchErrorIsolationDemo } from './error-isolation-demo';
import type { PatchBuilder } from './types';

export const patches: { name: string; builder: PatchBuilder }[] = [
  { name: 'Golden Spiral', builder: patchGoldenSpiral },
  { name: 'Domain Test', builder: patchDomainTest },
  { name: 'Tile Grid', builder: patchTileGrid },
  { name: 'Orbital Rings', builder: patchOrbitalRings },
  { name: 'Rect Mosaic', builder: patchRectMosaic },
  { name: 'Shape Kaleidoscope', builder: patchShapeKaleidoscope },
  { name: 'Perspective Camera', builder: patchPerspectiveCamera },
  { name: 'Feedback Rotation', builder: patchFeedbackRotation },
  { name: 'Feedback Simple', builder: patchFeedbackSimple },
  { name: 'Path Field Demo', builder: patchPathFieldDemo },
  { name: 'Error Isolation Demo', builder: patchErrorIsolationDemo },
];

export const DEFAULT_PATCH_INDEX = 0; // Golden Spiral
