import type { CanonicalType } from '../../core/canonical-types';
import type { FrontendError, FrontendOptions } from './index';
import type { BlockId, PortId } from '../../types';
import type {
  BindingControlDescriptor,
  InputBindingSummary,
} from './semantic-snapshot';

export type AuthoringCandidateStatus = 'valid' | 'deferred' | 'invalid' | 'blocked';
export type AuthoringMutationMode = 'addWriter' | 'replaceWriter';

export interface AuthoringTargetInput {
  readonly blockId: BlockId;
  readonly portId: PortId;
}

export interface AuthoringQueryOptions {
  readonly mutationMode: AuthoringMutationMode;
  readonly frontendOptions?: FrontendOptions;
}

export interface ConnectExistingSourcesQuery {
  readonly kind: 'connectExistingSources';
  readonly target: AuthoringTargetInput;
  readonly candidates: readonly {
    readonly candidateId: string;
    readonly sourceBlockId: BlockId;
    readonly sourcePortId: PortId;
  }[];
}

export interface ConnectTargetsForSourceQuery {
  readonly kind: 'connectTargetsForSource';
  readonly source: {
    readonly blockId: BlockId;
    readonly portId: PortId;
  };
  readonly candidates: readonly {
    readonly candidateId: string;
    readonly targetBlockId: BlockId;
    readonly targetPortId: PortId;
  }[];
}

export interface AddSourceBlocksQuery {
  readonly kind: 'addSourceBlocks';
  readonly target: AuthoringTargetInput;
  readonly candidates: readonly {
    readonly candidateId: string;
    readonly blockType: string;
  }[];
}

export type AuthoringQuery =
  | ConnectExistingSourcesQuery
  | ConnectTargetsForSourceQuery
  | AddSourceBlocksQuery;

export interface AuthoringQueryMetrics {
  readonly baselineAnalysisMs: number;
  readonly prefilterMs: number;
  readonly candidateCount: number;
  readonly prefilteredCount: number;
  readonly exactEvaluationCount: number;
  readonly exactEvaluationMs: number;
}

export interface AuthoringInsertedArtifacts {
  readonly blocks: readonly string[];
  readonly edges: readonly string[];
  readonly adapterBlocks: readonly string[];
  readonly defaultSourceBlocks: readonly string[];
}

export interface AuthoringCandidateResultBase {
  readonly candidateId: string;
  readonly status: AuthoringCandidateStatus;
  readonly reasonKind: string;
  readonly reason: string;
  readonly diagnostics: readonly FrontendError[];
  readonly resolvedTargetType?: CanonicalType;
  readonly resolvedSourceType?: CanonicalType;
  readonly binding?: InputBindingSummary;
  readonly controlSurface: readonly BindingControlDescriptor[];
  readonly insertedArtifacts: AuthoringInsertedArtifacts;
}

export interface ConnectExistingSourceResult extends AuthoringCandidateResultBase {
  readonly kind: 'connectExistingSources';
  readonly sourceBlockId: BlockId;
  readonly sourcePortId: PortId;
}

export interface ConnectTargetForSourceResult extends AuthoringCandidateResultBase {
  readonly kind: 'connectTargetsForSource';
  readonly targetBlockId: BlockId;
  readonly targetPortId: PortId;
}

export interface AddSourceBlockOutputResult extends AuthoringCandidateResultBase {
  readonly outputPortId: PortId;
}

export interface AddSourceBlockResult extends AuthoringCandidateResultBase {
  readonly kind: 'addSourceBlocks';
  readonly blockType: string;
  readonly outputs: readonly AddSourceBlockOutputResult[];
  readonly bestOutputPortId?: PortId;
}

export interface AuthoringBatchResult<T> {
  readonly queryKind: AuthoringQuery['kind'];
  readonly target?: AuthoringTargetInput;
  readonly source?: {
    readonly blockId: BlockId;
    readonly portId: PortId;
  };
  readonly mutationMode: AuthoringMutationMode;
  readonly baselineStatus: 'ready' | 'blocked';
  readonly baselineReasonKind?: string;
  readonly baselineReason?: string;
  readonly metrics: AuthoringQueryMetrics;
  readonly results: readonly T[];
}
