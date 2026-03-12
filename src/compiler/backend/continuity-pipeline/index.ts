import type { AcyclicOrLegalGraph } from '../../ir/patches';
import type { UnlinkedIRFragments } from '../lower-blocks';

import {
  allocateRenderMaterializationPipeline,
  type RenderMaterializationPipelineIR,
} from '../render-materialization-pipeline';

export type RenderMaterializationPipelineCompatIR = RenderMaterializationPipelineIR;

export function allocateRenderMaterializationPipelineCompat(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph,
): RenderMaterializationPipelineCompatIR {
  return allocateRenderMaterializationPipeline(unlinkedIR, validated);
}

/** @deprecated Use RenderMaterializationPipelineCompatIR. */
export type ContinuityPipelineIR = RenderMaterializationPipelineCompatIR;

/** @deprecated Use allocateRenderMaterializationPipelineCompat. */
export function allocateContinuityPipeline(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph,
): ContinuityPipelineIR {
  return allocateRenderMaterializationPipelineCompat(unlinkedIR, validated);
}
