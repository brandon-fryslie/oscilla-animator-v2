import type { PortId } from '../../types';

/**
 * Compiler-owned graph node representation.
 * // [LAW:one-source-of-truth] Backend consumes only compiler graph nodes, not Patch blocks.
 */
export interface CompilerGraphBlock {
  readonly id: string;
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** Optional human-readable display name (for debugger/diagnostics only). */
  readonly displayName?: string;
}

export type CompilerGraphEdgeRole = 'userWire' | 'defaultWire' | 'implicitCoerce' | 'internalHelper';

/**
 * Compiler-owned edge metadata (ID-addressed graph view).
 */
export interface CompilerGraphEdge {
  readonly id: string;
  readonly fromBlockId: string;
  readonly fromPort: PortId;
  readonly toBlockId: string;
  readonly toPort: PortId;
  readonly role: CompilerGraphEdgeRole;
}

/**
 * Compiler-owned graph contract.
 */
export interface CompilerGraph {
  readonly blocks: readonly CompilerGraphBlock[];
  readonly edges: readonly CompilerGraphEdge[];
}

