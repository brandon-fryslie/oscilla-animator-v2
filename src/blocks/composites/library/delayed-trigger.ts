/**
 * DelayedTrigger Library Composite
 *
 * Delays a sample-and-hold trigger by one frame using UnitDelay.
 * Useful for creating chained animations or sequenced events.
 */

import { composite } from '../builder';

//  composite(type, label?) — type must be unique across all registered blocks
export const DelayedTriggerComposite = composite('DelayedTrigger', 'Delayed Trigger')
  //  .desc(text) — optional, no effect on compilation
  .desc('One-frame delayed sample-and-hold - for sequenced animations')
  //  .capability(cap) — 'pure' | 'state' | 'render' | 'io'. Both SampleHold and UnitDelay hold state
  .capability('state')
  //  .block(id, type, params?) — no params needed here; SampleHold and UnitDelay use port defaults
  .block('sampleHold', 'SampleHold')     // latches value on trigger
  .block('delay', 'UnitDelay')           // delays output by one frame
  //  .connect(from, to) — "blockId.portId" → "blockId.portId"
  .connect('sampleHold.out', 'delay.in') // feed latched value into delay
  //  .in(externalId, ref, label?) — label auto-titlecases externalId when omitted ("value" → "Value")
  .in('value', 'sampleHold.value')       // expose the value to latch
  .in('trigger', 'sampleHold.trigger')   // expose the trigger signal
  //  .out(externalId, ref, label?) — label can contain any string, including punctuation
  .out('out', 'delay.out', 'Output (Delayed)') // expose delayed result
  .out('immediate', 'sampleHold.out')    // expose un-delayed latch (label auto → "Immediate")
  //  .build() — fails if no blocks or no exposed outputs
  .build();
