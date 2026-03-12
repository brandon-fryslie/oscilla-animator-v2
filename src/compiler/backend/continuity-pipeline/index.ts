import type { AcyclicOrLegalGraph } from '../../ir/patches';
import type { UnlinkedIRFragments } from '../lower-blocks';

import {
  allocateRenderMaterializationPipeline,
  type RenderMaterializationPipelineIR,
} from '../render-materialization-pipeline';

export type ContinuityPipelineIR = RenderMaterializationPipelineIR;

export function allocateContinuityPipeline(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph,
): ContinuityPipelineIR {
  return allocateRenderMaterializationPipeline(unlinkedIR, validated);
}
