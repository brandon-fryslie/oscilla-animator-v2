/**
 * Compiler Tester Fixtures
 *
 * Each fixture provides a function that builds a NormalizedPatch.
 * The compiler tester compiles it through the C1 backend (bypassing frontend)
 * and renders the result via the Rust WASM renderer.
 */

import type { NormalizedPatch } from '../../compiler/ir/NormalizedPatch';
import { makeSpinningRingPatch } from './spinning-ring';
import { makeDynamicRingPatch } from './dynamic-ring';

export interface CompilerFixture {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly makeNormalizedPatch: () => NormalizedPatch;
}

export const COMPILER_TESTER_FIXTURES: CompilerFixture[] = [
  {
    id: 'spinning-ring',
    label: 'Spinning Ring (minimal)',
    description: '2-block graph: Time → RenderInstances2D (no field wiring)',
    makeNormalizedPatch: makeSpinningRingPatch,
  },
  {
    id: 'dynamic-ring',
    label: 'Dynamic Ring',
    description: '26-block graph: full per-instance math wired through the graph',
    makeNormalizedPatch: makeDynamicRingPatch,
  },
];
