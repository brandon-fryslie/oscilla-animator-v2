/**
 * src/pillars/compile.ts
 *
 * Top-level three-phase orchestrator: frontend → lowering → assembly.
 */

import type { PipelineInstallPayload } from '../render/rust/boundary-contract';
import type { PillarPatch } from './types';
import { ALL_BLOCKS } from './blocks';
import { buildRegistry, buildNormalizedGraph } from './frontend';
import { lowerNormalizedGraph } from './lowering';
import { assemblePipelineInstallPayload } from './assembly';

export type CompileResult =
  | { readonly kind: 'ok'; readonly payload: PipelineInstallPayload }
  | { readonly kind: 'error'; readonly errors: readonly string[] };

export function compilePillarPatch(patch: PillarPatch): CompileResult {
  const registry = buildRegistry(ALL_BLOCKS);
  const frontend = buildNormalizedGraph(patch, registry);
  if (frontend.graph === null) {
    return {
      kind: 'error',
      errors: frontend.diagnostics.map((d) => d.message),
    };
  }
  const lowered = lowerNormalizedGraph(frontend.graph);
  if (lowered.errors.length > 0) {
    return { kind: 'error', errors: lowered.errors };
  }
  return { kind: 'ok', payload: assemblePipelineInstallPayload(lowered) };
}
