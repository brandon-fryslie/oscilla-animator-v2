/**
 * src/pillars/fixtures/index.ts
 *
 * Registry of pillar compiler-tester fixtures. Each entry is a named patch
 * builder plus UI metadata. The compiler-tester iterates this list in the
 * fixture selector.
 */

import type { PillarPatch } from '../types';
import { makeOrbitRingPatch } from './orbit-ring';

export interface PillarFixture {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly make: () => PillarPatch;
}

export const PILLAR_FIXTURES: readonly PillarFixture[] = [
  {
    id: 'orbit-ring',
    label: 'Orbit Ring',
    description:
      'First vertical slice: ParticlePool → ExpressionModifier → DrawBundle. ' +
      'Validates SourceBundle data flow end-to-end through the new pillar compiler.',
    make: makeOrbitRingPatch,
  },
];
