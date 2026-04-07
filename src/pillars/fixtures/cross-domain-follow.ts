/**
 * src/pillars/fixtures/cross-domain-follow.ts
 *
 * Slice 4 fixture: cross-domain secondary bundle reads via LoadField.
 *
 * Two ParticlePool generators of equal capacity. Pool A orbits normally
 * (timeFactor=1) and is rendered directly by sinkA. Pool B is a small
 * static ring (timeFactor=0) whose ExpressionModifier reads pool A's
 * positions as a SECONDARY bundle and adds them to its own positions —
 * gluing each B-dot to the corresponding A-dot. sinkB then renders the
 * modified pool B on top of pool A's render with `clearOnLoad: false`.
 *
 * Graph shape:
 *
 *   ParticlePool A (pool_a, capacity=32, radius=0.5, timeFactor=1)
 *                 │
 *                 │ primary
 *                 ▼
 *             DrawBundle sinkA                       ← writes pool_a:* to VRAM
 *                 (clearOnLoad=true)                    + renders pool_a
 *
 *   ParticlePool A also feeds modB as a SECONDARY bundle (slot='a').
 *   Because A's domainId ('pool_a') differs from modB's primary domainId
 *   ('pool_b'), the walker rewrites A's bundle to LoadField references
 *   before passing it into modB's lowering context. The DSL inside modB
 *   sees `a.pos_x` resolve to `loadField('pool_a:pos_x', ref('gid'))`.
 *
 *   ParticlePool B (pool_b, capacity=32, radius=0.15, timeFactor=0)
 *                 │
 *                 │ primary
 *                 ▼
 *             ExpressionModifier modB
 *                 │  expression:
 *                 │    pos_x = primary.pos_x + a.pos_x
 *                 │    pos_y = primary.pos_y + a.pos_y
 *                 │
 *                 │ (secondary 'a' ← ParticlePool A)
 *                 │
 *                 │ primary
 *                 ▼
 *             DrawBundle sinkB                       ← reads pool_a:* via
 *                 (clearOnLoad=false)                   LoadField, writes
 *                                                        pool_b:* to VRAM
 *                                                        + composites onto
 *                                                        sinkA's render
 *
 * Block order (sinkA before sinkB) determines roster order:
 *
 *   [computeA, drawPrepA, renderA, computeB, drawPrepB, renderB]
 *
 * computeA writes pool_a:pos_x/pos_y to VRAM. computeB reads them via
 * LoadField. The Rust scheduler inserts a memory barrier between the two
 * compute passes because computeB declares pool_a as a 'read' dependency.
 *
 * Visual: 32 colored dots of pool_a orbiting at radius 0.5, with 32 white
 * pool_b dots each rendered slightly offset from a corresponding pool_a
 * dot (at A's position + B's static-ring offset). As A rotates, B's dots
 * follow because they're computed from A's per-frame positions.
 */

import type { PillarPatch } from '../types';
import { clearCanvas, loadCanvas } from '../block-dsl/presentation/canvas-attachment';

const FOLLOW_EXPRESSION = `
  pos_x = primary.pos_x + a.pos_x
  pos_y = primary.pos_y + a.pos_y
`;

export function makeCrossDomainFollowPatch(): PillarPatch {
  return {
    blocks: [
      // --- Pool A: orbits normally, rendered directly ---
      {
        id: 'genA',
        kind: 'generator',
        type: 'ParticlePool',
        config: {
          domainId: 'pool_a',
          capacity: 32,
          radius: 0.5,
          timeFactor: 1,
        },
      },
      {
        id: 'sinkA',
        kind: 'intent',
        type: 'DrawBundle',
        config: {
          domainId: 'pool_a',
          shapeId: 'pool_a_quad',
          quadScale: 0.025,
          attachment: clearCanvas([0.05, 0.05, 0.07, 1]),
        },
      },
      // --- Pool B: static base ring, modified by reading A's positions ---
      {
        id: 'genB',
        kind: 'generator',
        type: 'ParticlePool',
        config: {
          domainId: 'pool_b',
          capacity: 32,
          radius: 0.15,
          // timeFactor=0 → static ring at the origin. All visible motion of
          // pool_b dots in this fixture comes from the cross-domain LoadField
          // reads in modB, not from pool_b's own time term.
          timeFactor: 0,
        },
      },
      {
        id: 'modB',
        kind: 'modifier',
        type: 'ExpressionModifier',
        config: {
          expression: FOLLOW_EXPRESSION,
        },
      },
      {
        id: 'sinkB',
        kind: 'intent',
        type: 'DrawBundle',
        config: {
          domainId: 'pool_b',
          shapeId: 'pool_b_quad',
          quadScale: 0.018,
          attachment: loadCanvas(),
        },
      },
    ],
    edges: [
      // genA → sinkA (primary)
      {
        id: 'e0',
        source: 'genA',
        target: 'sinkA',
        inputSlot: 'primary',
        role: 'primary',
      },
      // genB → modB (primary)
      {
        id: 'e1',
        source: 'genB',
        target: 'modB',
        inputSlot: 'primary',
        role: 'primary',
      },
      // genA → modB (secondary, slot='a')
      // This is THE cross-domain edge: source is in pool_a, target's
      // primary is pool_b. The walker rewrites the secondary bundle to
      // LoadField references when building modB's input bundles.
      {
        id: 'e2',
        source: 'genA',
        target: 'modB',
        inputSlot: 'a',
        role: 'secondary',
      },
      // modB → sinkB (primary)
      {
        id: 'e3',
        source: 'modB',
        target: 'sinkB',
        inputSlot: 'primary',
        role: 'primary',
      },
    ],
  };
}
