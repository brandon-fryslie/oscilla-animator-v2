import type { CanonicalType } from '../../core/canonical-types';
import type { FrontendError, FrontendOptions } from './index';
import type { BlockId, EdgeRole, PortId } from '../../types';
import type { Endpoint } from '../../graph/Patch';
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

export interface AuthoringTargetOutput {
  readonly blockId: BlockId;
  readonly portId: PortId;
}

export interface AuthoringTargetBlock {
  readonly blockId: BlockId;
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

export interface AddConsumerBlocksQuery {
  readonly kind: 'addConsumerBlocks';
  readonly target: AuthoringTargetOutput;
  readonly candidates: readonly {
    readonly candidateId: string;
    readonly blockType: string;
  }[];
}

export interface ReplaceBlockQuery {
  readonly kind: 'replaceBlock';
  readonly target: AuthoringTargetBlock;
  readonly candidates: readonly {
    readonly candidateId: string;
    readonly blockType: string;
  }[];
}

export type AuthoringQuery =
  | ConnectExistingSourcesQuery
  | ConnectTargetsForSourceQuery
  | AddSourceBlocksQuery
  | AddConsumerBlocksQuery
  | ReplaceBlockQuery;

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

export interface AddConsumerBlockInputResult extends AuthoringCandidateResultBase {
  readonly inputPortId: PortId;
}

export interface AddConsumerBlockResult extends AuthoringCandidateResultBase {
  readonly kind: 'addConsumerBlocks';
  readonly blockType: string;
  readonly inputs: readonly AddConsumerBlockInputResult[];
  readonly bestInputPortId?: PortId;
}

export interface ReplacementEdgePlan {
  readonly edgeId: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly enabled: boolean;
  readonly sortKey: number;
  readonly role: EdgeRole;
  readonly alias: string;
}

export interface ReplaceBlockResult extends AuthoringCandidateResultBase {
  readonly kind: 'replaceBlock';
  readonly blockType: string;
  readonly rewiredEdges: readonly ReplacementEdgePlan[];
}

export interface AuthoringBatchResult<T> {
  readonly queryKind: AuthoringQuery['kind'];
  readonly target?: AuthoringTargetInput | AuthoringTargetOutput | AuthoringTargetBlock;
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
