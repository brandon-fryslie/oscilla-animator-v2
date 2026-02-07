/**
 * Demo Patch Library
 *
 * Collection of pre-built demo patches showcasing Oscilla capabilities.
 * Each patch is a self-contained example with its own visual style and features.
 */

export { type PatchBuilder } from './types';
export { patchSimple } from './simple';
export { patchGoldenSpiral } from './golden-spiral';
export { patchMouseSpiral } from './mouse-spiral';
export { patchDomainTest } from './domain-test';
export { patchTileGrid, patchTileGridUV } from './tile-grid';
export { patchPerspectiveCamera } from './perspective-camera';
export { patchFeedbackSimple } from './feedback-simple';
export { patchFeedbackRotation } from './feedback-rotation';
export { patchPathFieldDemo } from './path-field-demo';
export { patchErrorIsolationDemo } from './error-isolation-demo';
export { patchRectMosaic } from './rect-mosaic';

import { patchSimple } from './simple';
import { patchGoldenSpiral } from './golden-spiral';
import { patchMouseSpiral } from './mouse-spiral';
import { patchDomainTest } from './domain-test';
import { patchTileGrid, patchTileGridUV } from './tile-grid';
import { patchPerspectiveCamera } from './perspective-camera';
import { patchFeedbackSimple } from './feedback-simple';
import { patchFeedbackRotation } from './feedback-rotation';
import { patchPathFieldDemo } from './path-field-demo';
import { patchErrorIsolationDemo } from './error-isolation-demo';
import { patchRectMosaic } from './rect-mosaic';
import type { PatchBuilder } from './types';

export const patches: { name: string; builder: PatchBuilder }[] = [
  { name: 'Simple', builder: patchSimple },
  { name: 'Golden Spiral', builder: patchGoldenSpiral },
  { name: 'Mouse Spiral', builder: patchMouseSpiral },
  { name: 'Domain Test', builder: patchDomainTest },
  { name: 'Tile Grid', builder: patchTileGrid },
  { name: 'Tile Grid UV', builder: patchTileGridUV },
  { name: 'Perspective Camera', builder: patchPerspectiveCamera },
  { name: 'Feedback Simple', builder: patchFeedbackSimple },
  { name: 'Feedback Rotation', builder: patchFeedbackRotation },
  { name: 'Path Field Demo', builder: patchPathFieldDemo },
  { name: 'Error Isolation Demo', builder: patchErrorIsolationDemo },
  { name: 'Rect Mosaic', builder: patchRectMosaic },
];

export const DEFAULT_PATCH_INDEX = 0; // Simple

export { type HclDemo, hclDemos } from './hcl-demos';
