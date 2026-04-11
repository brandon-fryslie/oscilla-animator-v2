/**
 * src/pillars/block-dsl/pass-builders/draw-prep-pass.ts
 *
 * Pure builder for the System_DrawPrep roster entry. The DrawPrep pass
 * reads `<domainId>:active` from arena scalar storage and writes it into
 * the draw-indirect args struct so subsequent draw calls dispatch the
 * right number of instances.
 *
 * One System_DrawPrep pass per domain that gets rendered.
 *
 * This module is a leaf — it imports only types from the boundary contract.
 */

import type {
  SymbolId,
  SystemPassSpec,
} from '../../../render/rust/boundary-contract';

export interface BuildDrawPrepPassArgs {
  /** Unique pass id within the roster (e.g. `${domainId}_prep`). */
  readonly passId: string;
  /** The block id that produced this pass; included in sourceBlockIds. */
  readonly sourceBlockId: string;
  /** The domain whose `${domainId}:active` scalar drives the indirect args. */
  readonly domainId: string;
  /** Vertices per instance (e.g. 6 for a unit quad). */
  readonly vertexCount: number;
}

export function buildDrawPrepPass(args: BuildDrawPrepPassArgs): SystemPassSpec {
  const activeSymbol = `${args.domainId}:active` as SymbolId;
  return {
    type: 'System_DrawPrep',
    passId: args.passId,
    sourceBlockIds: [args.sourceBlockId],
    activeLanesSymbol: activeSymbol as SystemPassSpec['activeLanesSymbol'],
    vertexCount: args.vertexCount,
  };
}
