/**
 * Seeded example graphs for the design mockup.
 *
 * Each example uses the compact text format. The mockup parses them on
 * demand. To add a new example, just add an entry to EXAMPLES — no graph
 * builder code needed.
 */

import { parseText } from './text-format';
import type { SerializedGraph } from './text-format';

export interface ExampleSpec {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly text: string;
}

export const EXAMPLES: readonly ExampleSpec[] = [
  {
    id: 'linear-chain',
    title: 'Linear chain (fully fused)',
    description:
      "Generator → two Expressions → Sink, all in one domain. Every wire is blue (fused). " +
      "The whole chain compiles to one fused expression tree at the sink. Zero VRAM stores " +
      "for intermediate values. Adding/removing Expression blocks does not change cost.",
    text: `
gen Gen "Particles" domain=dots
expr E1 "warp Y"
expr E2 "tint by Y"
sink Sink "draw"

Gen --primary--> E1
E1 --primary--> E2
E2 --primary--> Sink
`.trim(),
  },

  {
    id: 'fork-fanout',
    title: 'Fork (multi-fanout same domain)',
    description:
      "Expression E1 feeds two consumers (E2 and E3) within the same domain. The shared " +
      "subexpression for E1's output becomes a Let binding in the compute shader — one " +
      "ALU evaluation, two readers. No VRAM store. This is the 'tap an intermediate value' pattern.",
    text: `
gen Gen "Particles" domain=dots
expr E1 "warp"
expr E2 "tint A"
expr E3 "tint B"
sink S1 "draw A"
sink S2 "draw B"

Gen --primary--> E1
E1 --primary--> E2
E1 --primary--> E3
E2 --primary--> S1
E3 --primary--> S2
`.trim(),
  },

  {
    id: 'cross-domain-read',
    title: 'Cross-domain read (LoadField)',
    description:
      "Two generators with different domains. E_main operates on 'dots' (primary input) " +
      "and reads from 'clock' as a secondary bundle. The clock→E_main wire is orange — " +
      "it materializes as a LoadField from the clock domain's compute pass output. " +
      "This is the only way values cross between dispatch domains.",
    text: `
gen Dots "Particles" domain=dots
gen Clock "Time source" domain=clock
expr Main "warp by time"
sink Sink "draw"

Dots --primary--> Main
Clock --secondary--> Main
Main --primary--> Sink
`.trim(),
  },

  {
    id: 'simple-cycle',
    title: 'Simple feedback loop',
    description:
      "A two-node cycle: E1 reads E2's output as a secondary input, E2 reads E1's " +
      "output as its primary input, and E2 outputs to the sink. Only the back edge " +
      "(E2→E1, secondary, yellow) is materialized — it becomes a StoreField/LoadField " +
      "pair so E1 sees the previous frame's value. The forward edge (E1→E2, primary, " +
      "blue) still fuses normally. This is how stateful operations like oscillators " +
      "and accumulators work transparently — the user just writes the math, the " +
      "compiler detects the back edge and inserts persistence.",
    text: `
gen Gen "Particles" domain=dots
expr E1 "integrate position"
expr E2 "apply velocity"
sink Sink "draw"

Gen --primary--> E1
E1 --primary--> E2
E2 --secondary--> E1
E2 --primary--> Sink
`.trim(),
  },

  {
    id: 'cross-domain-cycle',
    title: 'Cross-domain feedback cycle',
    description:
      "Two domains where each Expression reads the OTHER domain's Expression output " +
      "as a secondary bundle. This creates a real graph cycle: EA depends on EB, EB " +
      "depends on EA. Each compute pass needs the other's output, but neither can run " +
      "first. The compiler must either (a) treat one of the cross-domain reads as a " +
      "previous-frame read (ping-pong), or (b) reject the topology with a clear error. " +
      "The cycle is detected via the secondary edges between EA and EB.",
    text: `
gen GA "Pool A" domain=poolA
gen GB "Pool B" domain=poolB
expr EA "update A from B"
expr EB "update B from A"
sink SA "draw A"
sink SB "draw B"

GA --primary--> EA
EB --secondary--> EA
GB --primary--> EB
EA --secondary--> EB
EA --primary--> SA
EB --primary--> SB
`.trim(),
  },

  {
    id: 'error-multi-primary',
    title: 'Error: multiple primary inputs',
    description:
      "An Expression cannot have more than one primary input — primary determines the " +
      "writable bundle and the dispatch domain, and there is exactly one of each. " +
      "Wire one as primary and others as secondary, or split into separate Expression " +
      "blocks if you need to write to both bundles.",
    text: `
gen GA "Particles A" domain=poolA
gen GB "Particles B" domain=poolB
expr E "ambiguous"
sink Sink "draw"

GA --primary--> E
GB --primary--> E
E --primary--> Sink
`.trim(),
  },
];

/**
 * Resolve an example to a parsed graph. Throws if the example text is invalid
 * (these are static so any error means I made a typo above).
 */
export function loadExample(id: string): SerializedGraph {
  const example = EXAMPLES.find((e) => e.id === id);
  if (!example) throw new Error(`Unknown example: ${id}`);
  const result = parseText(example.text);
  if (result.errors.length > 0) {
    throw new Error(`Example '${id}' has parse errors: ${result.errors.join('; ')}`);
  }
  return result.graph;
}
