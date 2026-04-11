/**
 * src/pillars/frontend/normalized-graph.ts
 *
 * The opaque-node interface the backend walker sees. There is no `kind`,
 * `type`, or metadata field the walker can branch on. Polymorphism is via
 * the `lower` closure reference (built by the frontend).
 */

import type { LoweringContext, LoweredBlock, ManifestContribution, NodeId } from '../block-api';

export interface NormalizedNode {
  readonly id: NodeId;
  readonly manifestContribution: ManifestContribution;
  readonly lower: (ctx: LoweringContext) => LoweredBlock;
}

export interface NormalizedEdge {
  readonly id: string;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly inputSlot: string;
  readonly role: 'primary' | 'secondary';
}

export interface NormalizedGraph {
  readonly nodes: readonly NormalizedNode[];
  readonly edges: readonly NormalizedEdge[];
}
