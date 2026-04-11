/**
 * src/pillars/block-dsl/pass-builders/draw-call.ts
 *
 * Pure builder for a `DrawCallSpec`. Takes already-built vertex AST,
 * fragment AST, and pipeline state, and returns a fully-formed draw call
 * ready to be embedded in a render pass.
 *
 * This module is a leaf — it imports only types from the boundary contract.
 */

import type {
  DrawCallSpec,
  PipelineStateSpec,
  StatementIR,
  SymbolId,
} from '../../../render/rust/boundary-contract';

export interface BuildDrawCallArgs {
  /** Unique intent id within the patch (e.g. `${domainId}_fill`). */
  readonly intentId: string;
  /** The domain whose SoA the draw call reads instance data from. */
  readonly domainId: string;
  /** The static geometry shape id (e.g. `${domainId}_quad`). */
  readonly shapeId: string;
  readonly vertexAst: readonly StatementIR[];
  readonly fragmentAst: readonly StatementIR[];
  readonly pipelineState: PipelineStateSpec;
  /** The camera global symbol id (typically `sys:camera`). */
  readonly cameraRef: SymbolId;
}

export function buildDrawCall(args: BuildDrawCallArgs): DrawCallSpec {
  return {
    intentId: args.intentId,
    source: {
      type: 'Domain',
      domainId: args.domainId as DrawCallSpec['source'] extends {
        type: 'Domain';
        domainId: infer D;
      }
        ? D
        : never,
      sourceKind: 'Topology',
      shapeId: args.shapeId as DrawCallSpec['source'] extends {
        type: 'Domain';
        shapeId: infer S;
      }
        ? S
        : never,
    },
    pipelineState: args.pipelineState,
    dependencies: {
      requiresGlobals: true,
      cameraRef: args.cameraRef as DrawCallSpec['dependencies']['cameraRef'],
      domains: { [args.domainId]: 'read' } as DrawCallSpec['dependencies']['domains'],
      textures: {},
    },
    vertexAst: args.vertexAst,
    fragmentAst: args.fragmentAst,
  };
}
