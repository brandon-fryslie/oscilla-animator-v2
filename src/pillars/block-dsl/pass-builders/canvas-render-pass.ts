/**
 * src/pillars/block-dsl/pass-builders/canvas-render-pass.ts
 *
 * Pure builder for a render pass targeting the canvas.
 *
 * The attachment is provided by the caller as a fully-formed value
 * (built via `clearCanvas([…])` or `loadCanvas()` from
 * `block-dsl/presentation/canvas-attachment.ts`). This builder NEVER
 * branches on attachment shape — it just hands the attachment to the
 * boundary contract. `[LAW:dataflow-not-control-flow]`
 *
 * Sample count, viewport, and scissor come from the canvas-target
 * constants module — single source of truth for canvas-bound passes.
 *
 * This module is a leaf — it imports types from the boundary contract
 * and constants/types from sibling presentation modules.
 */

import type {
  DrawCallSpec,
  RenderPassSpec,
} from '../../../render/rust/boundary-contract';
import type { CanvasAttachment } from '../presentation/canvas-attachment';
import {
  CANVAS_SAMPLE_COUNT,
  CANVAS_SCISSOR,
  CANVAS_VIEWPORT,
} from '../presentation/canvas-target';

export interface BuildCanvasRenderPassArgs {
  /** Unique pass id within the roster (e.g. `${domainId}_draw`). */
  readonly passId: string;
  /** The block id that produced this pass; included in sourceBlockIds. */
  readonly sourceBlockId: string;
  /** The fully-built draw call. */
  readonly drawCall: DrawCallSpec;
  /** Caller-provided attachment value (clear or load). */
  readonly attachment: CanvasAttachment;
}

export function buildCanvasRenderPass(
  args: BuildCanvasRenderPassArgs,
): RenderPassSpec {
  return {
    type: 'Render',
    passId: args.passId,
    sourceBlockIds: [args.sourceBlockId],
    sampleCount: CANVAS_SAMPLE_COUNT,
    targets: {
      colors: [args.attachment],
    },
    viewport: CANVAS_VIEWPORT,
    scissorRect: CANVAS_SCISSOR,
    drawCalls: [args.drawCall],
  };
}
