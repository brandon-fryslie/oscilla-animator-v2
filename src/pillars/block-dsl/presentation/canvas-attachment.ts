/**
 * src/pillars/block-dsl/presentation/canvas-attachment.ts
 *
 * Constructors for color attachments targeting the canvas.
 *
 * The whole point of this module is `[LAW:dataflow-not-control-flow]`:
 * fixtures and blocks decide which kind of attachment they want by
 * calling the right constructor here, and the resulting value flows
 * downstream as data with no further branching. The render pass builder
 * never inspects an attachment's loadOp to choose between two code
 * paths — it just hands the attachment to the boundary contract.
 *
 * The constructors return objects whose shape exactly matches the
 * boundary contract (`RenderPassSpec['targets']['colors'][number]`), so
 * no conversion step is needed at the consumer.
 *
 * This module is a leaf — it imports only types from the boundary
 * contract.
 */

import type { RenderPassSpec } from '../../../render/rust/boundary-contract';

/**
 * The shape of a single color attachment in a render pass. Defined as a
 * type alias here so block files can reference it for config validation
 * without importing from the boundary contract directly.
 */
export type CanvasAttachment = RenderPassSpec['targets']['colors'][number];

/**
 * Build a clear-on-load canvas attachment. The first render pass in any
 * frame should use this so the canvas starts in a known state.
 *
 * The clearColor is RGBA in the [0, 1] range matching WebGPU's
 * `wgpu::Color` shape.
 */
export const clearCanvas = (
  clearColor: readonly [number, number, number, number],
): CanvasAttachment => ({
  textureId: 'canvas',
  loadOp: 'clear',
  clearColor,
});

/**
 * Build a load-and-composite canvas attachment. Use this on the second
 * and later render passes in a frame so prior render-pass output is
 * preserved on the canvas.
 *
 * No clearColor — the boundary contract makes it optional and WebGPU
 * ignores it when loadOp is 'load'.
 */
export const loadCanvas = (): CanvasAttachment => ({
  textureId: 'canvas',
  loadOp: 'load',
});
