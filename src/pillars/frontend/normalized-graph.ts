import type { ManifestContribution, NodeId } from '../block-api';

export interface NormalizedNode {
  readonly id: NodeId;
  readonly manifestContribution: ManifestContribution;
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
