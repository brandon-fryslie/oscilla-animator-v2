/**
 * PingPong Library Composite
 *
 * Generates a triangle wave from 0→1→0 using Phasor and math.
 * Formula: 1 - |2*phase - 1| = triangle wave
 */

import { composite } from '../builder';

//  composite(type, label?) — 'PingPong' is the block type, 'Ping Pong' is the display label
export const PingPongComposite = composite('PingPong', 'Ping Pong')
  //  .desc(text) — optional human-readable description
  .desc('Triangle wave (0→1→0) - bouncing animation from Phasor')
  //  .capability(cap) — 'pure' | 'state' | 'render' | 'io'. Phasor accumulates phase across frames
  .capability('state')
  //  .block(id, type, params?) — id is a local name used in .connect/.in/.out refs. params is optional Record<string, unknown>
  .block('phasor', 'Phasor')             // 0→1 sawtooth phase
  .block('two', 'Const', { value: 2 })   // constant 2
  .block('one', 'Const', { value: 1 })   // constant 1
  .block('mult', 'Multiply')             // 2 * phase
  .block('sub1', 'Subtract')             // 2*phase - 1
  .block('expr', 'Expression', { expression: 'abs(a)' }) // |2*phase - 1|
  .block('sub2', 'Subtract')             // 1 - |2*phase - 1|
  //  .connect(from, to) — both args are "blockId.portId" strings
  .connect('phasor.out', 'mult.a')       // phase → multiply
  .connect('two.out', 'mult.b')          // 2 → multiply
  .connect('mult.out', 'sub1.a')         // 2*phase → subtract
  .connect('one.out', 'sub1.b')          // 1 → subtract
  .connect('sub1.out', 'expr.a')         // (2*phase - 1) → abs
  .connect('one.out', 'sub2.a')          // 1 → final subtract
  .connect('expr.out', 'sub2.b')         // |...| → final subtract
  //  .in(externalId, ref, label?) — externalId is the port name users see, ref is "blockId.portId" internally
  .in('frequency', 'phasor.frequency')   // expose oscillation speed
  //  .out(externalId, ref, label?) — same as .in(). label defaults to titleCase(externalId) if omitted
  .out('out', 'sub2.out', 'Output')      // expose triangle wave (0→1→0)
  .out('phase', 'phasor.out', 'Raw Phase') // expose raw sawtooth (0→1)
  //  .build() — validates and returns CompositeBlockDef
  .build();
