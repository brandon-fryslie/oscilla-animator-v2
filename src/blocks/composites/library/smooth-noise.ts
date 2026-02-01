/**
 * SmoothNoise Library Composite
 *
 * Generates smooth random values by feeding Noise through Lag.
 * Useful for organic, continuous random modulation.
 */

import { composite } from '../builder';

//  composite(type, label?) — type is the block type name, label is the display name (auto-titlecased if omitted)
export const SmoothNoiseComposite = composite('SmoothNoise', 'Smooth Noise')
  //  .desc(text) — optional description shown in editor tooltips
  .desc('Smooth random values - Noise filtered through Lag for organic modulation')
  //  .capability(cap) — optional, defaults to 'pure'. Values: 'pure' | 'state' | 'render' | 'io'. Lag holds state
  .capability('state')
  //  .block(id, type, params?) — add an internal block. id is local name, type is registered block type, params are optional defaults
  .block('noise', 'Noise')            // random value source
  .block('lag', 'Lag', { smoothing: 0.9 }) // smoothing filter (0.9 = slow, organic)
  //  .connect(from, to) — wire "blockId.portId" → "blockId.portId" inside the composite
  .connect('noise.out', 'lag.target') // feed noise into lag
  //  .in(externalId, ref, label?) — expose an internal input. ref is "blockId.portId". label auto-titlecased if omitted
  .in('x', 'noise.x', 'X')           // expose noise seed input
  .in('smoothing', 'lag.smoothing')   // expose smoothing amount
  //  .out(externalId, ref, label?) — expose an internal output. same args as .in()
  .out('out', 'lag.out', 'Output')    // expose smoothed result
  //  .build() — returns a CompositeBlockDef. Validates at least one block and one output exist
  .build();
