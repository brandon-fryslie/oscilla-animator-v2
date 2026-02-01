/**
 * ColorCycle Library Composite
 *
 * Generates cycling colors by driving a simple color constant.
 * Simplified version - uses just a constant color output.
 */

import { composite } from '../builder';

//  composite(type, label?) — label is optional; 'Color Cycle' overrides auto-titlecase of 'ColorCycle'
export const ColorCycleComposite = composite('ColorCycle', 'Color Cycle')
  //  .desc(text) — optional tooltip description
  .desc('Color output (simplified)')
  //  .capability(cap) — 'pure' | 'state' | 'render' | 'io'. Phasor accumulates phase, so 'state'
  .capability('state')
  //  .block(id, type, params?) — params is Record<string, unknown>; here an RGBA array
  .block('phasor', 'Phasor')            // 0→1 cycling phase
  .block('color', 'Const', { value: [1, 0.5, 0.5, 1] }) // constant RGBA color
  //  no .connect() — these blocks aren't wired to each other internally
  //  .in(externalId, ref, label?) — externalId is what users connect to; ref points to the internal block's port
  .in('frequency', 'phasor.frequency')   // expose oscillation speed
  //  .out(externalId, ref, label?) — label omitted → auto-titlecased ("color" → "Color")
  .out('color', 'color.out')             // expose color constant
  .out('phase', 'phasor.out')            // expose raw phase
  //  .build() — produces CompositeBlockDef; readonly=true by default (use .editable() to override)
  .build();
