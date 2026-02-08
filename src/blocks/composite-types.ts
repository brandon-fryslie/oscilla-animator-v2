/**
 * Composite Block Type Definitions
 *
 * Types for composite blocks - blocks that contain an internal graph
 * of other blocks, exposing selected ports to the outside.
 *
 * Composite blocks expand during graph normalization (pass0) into
 * derived blocks, before default source materialization.
 */

import type { CanonicalType } from '../core/canonical-types';
import type { DefaultSource, UIControlHint } from '../types';
import type { BlockDef, InputDef, OutputDef, Capability, BlockCardinalityMetadata, BlockPayloadMetadata } from './registry';

// =============================================================================
// Internal Block Types
// =============================================================================

/**
 * Internal block ID within a composite.
 * NOT globally unique - scoped to the composite definition.
 */
export type InternalBlockId = string & { readonly __brand: 'InternalBlockId' };

/**
 * Helper to create typed InternalBlockId.
 */
export function internalBlockId(id: string): InternalBlockId {
  return id as InternalBlockId;
}

/**
 * Definition of a block inside a composite.
 * References a registered block type with optional params.
 */
export interface InternalBlockDef {
  /** Block type - must be a registered block type */
  readonly type: string;
  /** Parameters for the internal block instance */
  readonly params?: Readonly<Record<string, unknown>>;
  /** Optional display name for editor UI */
  readonly displayName?: string;
}

/**
 * Internal edge connecting two blocks inside a composite.
 */
export interface InternalEdge {
  readonly fromBlock: InternalBlockId;
  readonly fromPort: string;
  readonly toBlock: InternalBlockId;
  readonly toPort: string;
}

// =============================================================================
// Port Exposure Types
// =============================================================================

/**
 * Exposed input port mapping.
 * Maps an external port ID to an internal block's input port.
 */
export interface ExposedInputPort {
  /** External port ID (visible to outside) */
  readonly externalId: string;
  /** Display label for the exposed port */
  readonly externalLabel?: string;
  /** Which internal block this maps to */
  readonly internalBlockId: InternalBlockId;
  /** Which port on the internal block */
  readonly internalPortId: string;
  /** Override the internal port's type (optional) */
  readonly type?: CanonicalType;
  /** Override the internal port's default source (optional) */
  readonly defaultSource?: DefaultSource;
  /** Override the internal port's UI hint (optional) */
  readonly uiHint?: UIControlHint;
}

/**
 * Exposed output port mapping.
 * Maps an external port ID to an internal block's output port.
 */
export interface ExposedOutputPort {
  /** External port ID (visible to outside) */
  readonly externalId: string;
  /** Display label for the exposed port */
  readonly externalLabel?: string;
  /** Which internal block this maps to */
  readonly internalBlockId: InternalBlockId;
  /** Which port on the internal block */
  readonly internalPortId: string;
}

// =============================================================================
// Composite Block Definition
// =============================================================================

/**
 * Composite block definition.
 *
 * Extends the base block definition with internal graph structure
 * and port exposure configuration.
 *
 * Key differences from primitive BlockDef:
 * - form is always 'composite'
 * - has internalBlocks and internalEdges instead of lower()
 * - inputs/outputs are computed from exposed ports
 *
 * Composites expand during normalization pass0, before any other passes.
 */
export interface CompositeBlockDef {
  // Identity
  readonly type: string;

  // UI metadata
  readonly label: string;
  readonly category: string;
  readonly description?: string;

  // Form is always 'composite'
  readonly form: 'composite';

  /**
   * Capability of the composite.
   * Computed from internal blocks' capabilities:
   * - If any internal block has 'state' capability, composite has 'state'
   * - If any internal block has 'render' capability, composite has 'render'
   * - etc.
   */
  readonly capability: Capability;

  /**
   * Whether this composite is read-only (library composite).
   * Library composites cannot be edited or deleted by users.
   */
  readonly readonly?: boolean;

  /**
   * Cardinality metadata for cardinality-generic composites.
   * Usually derived from internal block metadata.
   */
  readonly cardinality?: BlockCardinalityMetadata;

  /**
   * Payload metadata for payload-generic composites.
   * Usually derived from internal block metadata.
   */
  readonly payload?: BlockPayloadMetadata;

  // ==========================================================================
  // Internal Graph
  // ==========================================================================

  /** Internal blocks within the composite */
  readonly internalBlocks: ReadonlyMap<InternalBlockId, InternalBlockDef>;

  /** Internal edges connecting internal blocks */
  readonly internalEdges: readonly InternalEdge[];

  // ==========================================================================
  // Port Exposure
  // ==========================================================================

  /** Input ports exposed to the outside */
  readonly exposedInputs: readonly ExposedInputPort[];

  /** Output ports exposed to the outside */
  readonly exposedOutputs: readonly ExposedOutputPort[];

  // ==========================================================================
  // Computed Ports (for BlockDef compatibility)
  // ==========================================================================

  /**
   * Input definitions - computed from exposedInputs.
   * Allows CompositeBlockDef to be used where BlockDef.inputs is expected.
   */
  readonly inputs: Record<string, InputDef>;

  /**
   * Output definitions - computed from exposedOutputs.
   * Allows CompositeBlockDef to be used where BlockDef.outputs is expected.
   */
  readonly outputs: Record<string, OutputDef>;

  // Optional tags (same as BlockDef)
  readonly tags?: {
    readonly irPortContract?: 'strict' | 'relaxed';
  };
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a block definition is a composite.
 */
export function isCompositeBlockDef(def: BlockDef | CompositeBlockDef): def is CompositeBlockDef {
  return def.form === 'composite';
}

/**
 * Type guard to check if a block type string refers to a composite.
 * Requires the block to be registered.
 */
export function isCompositeBlockType(blockType: string): boolean {
  // Import here to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getCompositeDefinition } = require('./registry');
  return getCompositeDefinition(blockType) !== undefined;
}

// =============================================================================
// Derived Block Role Metadata
// =============================================================================

/**
 * Metadata for blocks derived from composite expansion.
 * Used by the editor to trace expanded blocks back to their source composite.
 */
export interface CompositeExpansionMeta {
  readonly kind: 'compositeExpansion';
  /** The composite definition type that was expanded */
  readonly compositeDefId: string;
  /** The composite block instance ID that was expanded */
  readonly compositeInstanceId: string;
  /** The internal block ID within the composite */
  readonly internalBlockId: InternalBlockId;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation error for composite definitions.
 */
export interface CompositeValidationError {
  readonly code:
    | 'EMPTY_COMPOSITE'
    | 'NO_EXPOSED_OUTPUTS'
    | 'UNKNOWN_INTERNAL_BLOCK_TYPE'
    | 'INVALID_PORT_MAPPING'
    | 'DUPLICATE_EXTERNAL_PORT'
    | 'CIRCULAR_REFERENCE'
    | 'MAX_NESTING_EXCEEDED';
  readonly message: string;
  /** Location of the error within the composite (if applicable) */
  readonly location?: {
    readonly internalBlockId?: InternalBlockId;
    readonly portId?: string;
    readonly edgeIndex?: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

/** ID prefix for expanded composite blocks */
export const COMPOSITE_EXPANSION_PREFIX = 'cx:';
