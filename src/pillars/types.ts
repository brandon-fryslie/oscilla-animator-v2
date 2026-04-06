/**
 * src/pillars/types.ts
 *
 * The user-authored graph type. PillarPatch is the input to the frontend.
 * Compiler-internal types (NormalizedGraph, LoweringContext, BlockDefinition,
 * etc.) live in block-api.ts and the phase directories.
 */

export type PillarKind = 'generator' | 'modifier' | 'intent';

export interface PillarBlock {
  readonly id: string;
  readonly kind: PillarKind;
  readonly type: string;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface PillarEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly inputSlot: string;
  readonly role: 'primary' | 'secondary';
}

export interface PillarPatch {
  readonly blocks: readonly PillarBlock[];
  readonly edges: readonly PillarEdge[];
}
