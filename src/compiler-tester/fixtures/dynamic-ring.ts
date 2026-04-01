/**
 * Compiler Tester Fixture: Dynamic Ring
 *
 * Same visual as spinning-ring, but all math wired through the graph:
 *
 *   InstanceIndex ─→ Multiply(*, Const(0.098)) ─→ Add(+, Time) ─→ "angle"
 *   angle ─→ Cos ─→ Multiply(*, Const(0.7)) ─→ RenderInstances2D.pos_x
 *   angle ─→ Sin ─→ Multiply(*, Const(0.7)) ─→ RenderInstances2D.pos_y
 *   angle ─→ Sin ─→ Multiply(*, Const(0.5)) ─→ Add(+, Const(0.5)) ─→ .color_r
 *   Add(angle, Const(2.094)) ─→ Sin ─→ Multiply ─→ Add ─→ .color_g
 *   Add(angle, Const(4.189)) ─→ Sin ─→ Multiply ─→ Add ─→ .color_b
 *
 * Exercises: multi-fanout caching, deep expression fusion, per-instance math.
 */

import type { NormalizedPatch, NormalizedEdge } from '../../compiler/ir/NormalizedPatch';
import type { CompilerGraphBlock, CompilerGraph } from '../../compiler/ir/CompilerGraph';
import type { BlockIndex } from '../../compiler/ir/BlockIndex';
import type { BlockId, PortId } from '../../types/compiler';

// Helper to create edges concisely
function edge(from: number, fromPort: string, to: number, toPort: string): NormalizedEdge {
  return {
    fromBlock: from as BlockIndex,
    fromPort: fromPort as PortId,
    toBlock: to as BlockIndex,
    toPort: toPort as PortId,
    alias: `${fromPort}_to_${toPort}`,
  };
}

export function makeDynamicRingPatch(): NormalizedPatch {
  // Block indices:
  //  0: InstanceIndex
  //  1: Const(0.09817477042468103)  — 2π/64
  //  2: Multiply(instanceIdx * step)
  //  3: InfiniteTimeRoot
  //  4: Add(angle_base + time) → "angle"
  //  5: Cos(angle) → raw_cos
  //  6: Const(0.7) — radius
  //  7: Multiply(cos * 0.7) → pos_x
  //  8: Sin(angle) → raw_sin
  //  9: Multiply(sin * 0.7) → pos_y
  // 10: Sin(angle) → for color_r base  (reuses block 8 via fanout)
  // 11: Const(0.5) — color scale
  // 12: Multiply(sin_r * 0.5)
  // 13: Const(0.5) — color offset
  // 14: Add(scaled + 0.5) → color_r
  // 15: Const(2.094) — green phase offset
  // 16: Add(angle + 2.094) → angle_g
  // 17: Sin(angle_g) → sin_g
  // 18: Multiply(sin_g * 0.5)
  // 19: Add(scaled_g + 0.5) → color_g
  // 20: Const(4.189) — blue phase offset
  // 21: Add(angle + 4.189) → angle_b
  // 22: Sin(angle_b) → sin_b
  // 23: Multiply(sin_b * 0.5)
  // 24: Add(scaled_b + 0.5) → color_b
  // 25: RenderInstances2D (SINK)

  const blocks: CompilerGraphBlock[] = [
    { id: 'b0',  type: 'InstanceIndex',      params: {} },
    { id: 'b1',  type: 'Const',              params: { value: 0.09817477042468103 } },
    { id: 'b2',  type: 'Multiply',           params: {} },
    { id: 'b3',  type: 'InfiniteTimeRoot',   params: {} },
    { id: 'b4',  type: 'Add',                params: {} },
    { id: 'b5',  type: 'Cos',                params: {} },
    { id: 'b6',  type: 'Const',              params: { value: 0.7 } },
    { id: 'b7',  type: 'Multiply',           params: {} },
    { id: 'b8',  type: 'Sin',                params: {} },
    { id: 'b9',  type: 'Multiply',           params: {} },
    { id: 'b10', type: 'Sin',                params: {} },
    { id: 'b11', type: 'Const',              params: { value: 0.5 } },
    { id: 'b12', type: 'Multiply',           params: {} },
    { id: 'b13', type: 'Const',              params: { value: 0.5 } },
    { id: 'b14', type: 'Add',                params: {} },
    { id: 'b15', type: 'Const',              params: { value: 2.094 } },
    { id: 'b16', type: 'Add',                params: {} },
    { id: 'b17', type: 'Sin',                params: {} },
    { id: 'b18', type: 'Multiply',           params: {} },
    { id: 'b19', type: 'Add',                params: {} },
    { id: 'b20', type: 'Const',              params: { value: 4.189 } },
    { id: 'b21', type: 'Add',                params: {} },
    { id: 'b22', type: 'Sin',                params: {} },
    { id: 'b23', type: 'Multiply',           params: {} },
    { id: 'b24', type: 'Add',                params: {} },
    { id: 'b25', type: 'RenderInstances2D',  params: { domainId: 'dots', capacity: 64 } },
  ];

  const edges: NormalizedEdge[] = [
    // angle = f32(instanceIdx) * (2π/64) + time
    edge(0, 'out', 2, 'a'),   // InstanceIndex.out → Multiply.a
    edge(1, 'out', 2, 'b'),   // Const(0.098).out → Multiply.b
    edge(2, 'out', 4, 'a'),   // Multiply.out → Add.a
    edge(3, 'time', 4, 'b'),  // Time.time → Add.b  → "angle" (b4)

    // pos_x = cos(angle) * 0.7
    edge(4, 'out', 5, 'x'),   // angle → Cos.x
    edge(5, 'out', 7, 'a'),   // Cos.out → Multiply.a
    edge(6, 'out', 7, 'b'),   // Const(0.7) → Multiply.b
    edge(7, 'out', 25, 'pos_x'), // → RenderInstances2D.pos_x

    // pos_y = sin(angle) * 0.7
    edge(4, 'out', 8, 'x'),   // angle → Sin.x
    edge(8, 'out', 9, 'a'),   // Sin.out → Multiply.a
    edge(6, 'out', 9, 'b'),   // Const(0.7) → Multiply.b  (reuse b6)
    edge(9, 'out', 25, 'pos_y'), // → RenderInstances2D.pos_y

    // color_r = sin(angle) * 0.5 + 0.5
    edge(4, 'out', 10, 'x'),   // angle → Sin.x  (reuse angle via fanout)
    edge(10, 'out', 12, 'a'),  // Sin.out → Multiply.a
    edge(11, 'out', 12, 'b'),  // Const(0.5) → Multiply.b
    edge(12, 'out', 14, 'a'),  // Multiply.out → Add.a
    edge(13, 'out', 14, 'b'),  // Const(0.5) → Add.b
    edge(14, 'out', 25, 'color_r'), // → RenderInstances2D.color_r

    // color_g = sin(angle + 2.094) * 0.5 + 0.5
    edge(4, 'out', 16, 'a'),   // angle → Add.a
    edge(15, 'out', 16, 'b'),  // Const(2.094) → Add.b
    edge(16, 'out', 17, 'x'),  // Add.out → Sin.x
    edge(17, 'out', 18, 'a'),  // Sin.out → Multiply.a
    edge(11, 'out', 18, 'b'),  // Const(0.5) → Multiply.b  (reuse b11)
    edge(18, 'out', 19, 'a'),  // Multiply.out → Add.a
    edge(13, 'out', 19, 'b'),  // Const(0.5) → Add.b  (reuse b13)
    edge(19, 'out', 25, 'color_g'), // → RenderInstances2D.color_g

    // color_b = sin(angle + 4.189) * 0.5 + 0.5
    edge(4, 'out', 21, 'a'),   // angle → Add.a
    edge(20, 'out', 21, 'b'),  // Const(4.189) → Add.b
    edge(21, 'out', 22, 'x'),  // Add.out → Sin.x
    edge(22, 'out', 23, 'a'),  // Sin.out → Multiply.a
    edge(11, 'out', 23, 'b'),  // Const(0.5) → Multiply.b  (reuse b11)
    edge(23, 'out', 24, 'a'),  // Multiply.out → Add.a
    edge(13, 'out', 24, 'b'),  // Const(0.5) → Add.b  (reuse b13)
    edge(24, 'out', 25, 'color_b'), // → RenderInstances2D.color_b
  ];

  const blockIndex = new Map<BlockId, BlockIndex>();
  for (let i = 0; i < blocks.length; i++) {
    blockIndex.set(blocks[i].id as BlockId, i as BlockIndex);
  }

  const graph: CompilerGraph = {
    blocks,
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      fromBlockId: blocks[e.fromBlock].id,
      fromPort: e.fromPort,
      toBlockId: blocks[e.toBlock].id,
      toPort: e.toPort,
      role: 'userWire' as const,
    })),
  };

  return { graph, blockIndex, blocks, edges };
}
