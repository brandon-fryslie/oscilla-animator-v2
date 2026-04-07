/**
 * src/pillars/fixtures/index.ts
 *
 * Registry of pillar compiler-tester fixtures. Each entry is a named patch
 * builder plus UI metadata. The compiler-tester iterates this list in the
 * fixture selector.
 */

import type { PillarPatch } from '../types';
import { makeOrbitRingPatch } from './orbit-ring';
import { makeClockDrivenWobblePatch } from './clock-driven-wobble';
import { makeCrossDomainFollowPatch } from './cross-domain-follow';

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
  {
    id: 'clock-driven-wobble',
    label: 'Clock-Driven Wobble',
    description:
      'Slice 3: secondary bundle inputs. Static ring from a ParticlePool ' +
      '(timeFactor=0); a Clock generator feeds sys:time into the ' +
      'ExpressionModifier as a secondary bundle, which adds a rotating ' +
      'offset to each dot\'s position. Proves that the Modifier can weave ' +
      'a secondary-bundle value into its primary bundle\'s field math.',
    make: makeClockDrivenWobblePatch,
  },
  {
    id: 'cross-domain-follow',
    label: 'Cross-Domain Follow',
    description:
      'Slice 4: cross-domain LoadField reads. Two ParticlePools of equal ' +
      'capacity. Pool A orbits and is rendered first; Pool B is a static ' +
      'ring whose ExpressionModifier reads A\'s positions as a secondary ' +
      'bundle. The walker detects the domain mismatch and rewrites the ' +
      'secondary bundle to LoadField calls so B\'s compute pass reads ' +
      'A\'s field values from VRAM (written by A\'s compute pass) instead ' +
      'of inlining A\'s expression trees.',
    make: makeCrossDomainFollowPatch,
  },
];
