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

import { patchGoldenSpiral } from './golden-spiral';
import { patchDomainTest } from './domain-test';
import { patchTileGrid } from './tile-grid';
import { patchOrbitalRings } from './orbital-rings';
import { patchRectMosaic } from './rect-mosaic';
import { patchShapeKaleidoscope } from './shape-kaleidoscope';
import { patchPerspectiveCamera } from './perspective-camera';
import { patchFeedbackRotation } from './feedback-rotation';
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
];

export const DEFAULT_PATCH_INDEX = 0; // Golden Spiral
