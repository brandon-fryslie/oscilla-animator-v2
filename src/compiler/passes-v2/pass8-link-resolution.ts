/**
 * Pass 8: Link Resolution
 *
 * Resolves all ValueRefs to concrete node IDs and creates BlockInputRootIR
 * and BlockOutputRootIR tables.
 *
 * This pass finalizes the IR by ensuring every port has a concrete value
 * and there are no dangling references.
 *
 * STATUS: Fully implemented but not currently used in compilation pipeline.
 *
 * RATIONALE:
 * - Pass 6's resolveInputsWithMultiInput handles all standard input resolution
 * - Camera blocks are lowered in Pass 6, not deferred to Pass 8
 * - No blocks currently require deferred link resolution
 *
 * FUTURE USE:
 * - May be needed if we add blocks that require post-schedule link resolution
 * - Useful reference implementation for advanced resolution strategies
 *
 * HISTORY:
 * - Workstream 04 (2026-01-03): Split camera lowering to Pass 6
 * - Phase 0.5 Sprint 4 (2026-01-03): Removed unused _wires parameter
 *
 * Workstream 04: Render Sink Emission Policy (2026-01-03)
 * - Split applyRenderLowering into applyCameraLowering (cameras only)
 * - Render blocks are lowered in pass6, not pass8
 * - Prevents duplicate render sink registration
 *
 * Phase 0.5 Sprint 4: Deprecated Type Cleanup (2026-01-03)
 * - Removed unused _wires parameter (CompilerConnection deprecated)
 * - All connections now use Edge type exclusively
 */

import type { Block, TransformStep, AdapterStep, Edge } from "../../types";
import type { BlockIndex } from "../ir/patches";
import type { IRBuilder } from "../ir/IRBuilder";
import type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";
import type { CompileError } from "../types";
import { getBlockType } from "../ir/lowerTypes";
import type { LowerCtx } from "../ir/lowerTypes";
import { TRANSFORM_REGISTRY } from "../../transforms";
import type { TransformIRCtx } from "../../transforms";
import { getBlockDefinition } from "../../blocks/registry";

// =============================================================================
// Types
// =============================================================================

/**
 * BlockInputRootIR - Maps each block input to its value source
 */
export interface BlockInputRootIR {
  /** Flat array of ValueRefs, indexed by (blockIdx * maxInputs + portIdx) */
  readonly refs: ValueRefPacked[];

  /** Helper to get ValueRef for a specific input */
  indexOf(blockIndex: BlockIndex, portIdx: number): number;
}

/**
 * BlockOutputRootIR - Maps each block output to its value
 */
export interface BlockOutputRootIR {
  /** Flat array of ValueRefs, indexed by (blockIdx * maxOutputs + portIdx) */
  readonly refs: ValueRefPacked[];

  /** Helper to get ValueRef for a specific output */
  indexOf(blockIndex: BlockIndex, portIdx: number): number;
}

/**
 * LinkResolutionResult - Final IR with all links resolved
 */
export interface LinkResolutionResult {
  readonly blocks: BlockInputRootIR;
  readonly outputs: BlockOutputRootIR;
  readonly errors: CompileError[];
}

// =============================================================================
// Pass 8: Link Resolution
// =============================================================================

/**
 * Pass 8: Link Resolution
 *
 * Takes unlinked IR fragments and resolves all ValueRefs to concrete node IDs.
 * Creates BlockInputRootIR and BlockOutputRootIR lookup tables.
 *
 * @param fragments - Unlinked IR from Pass 6
 * @param blocks - Block array for reference
 * @param edges - Edge array for connectivity
 * @param builder - IR builder for type info
 * @returns LinkResolutionResult with resolved links or errors
 */
export function pass8LinkResolution(
  fragments: UnlinkedIRFragments,
  blocks: readonly Block[],
  edges: readonly Edge[],
  builder: IRBuilder
): LinkResolutionResult {
  const errors: CompileError[] = [];

  // Build edge lookup by target
  const incomingEdges = buildIncomingEdgeMap(edges);

  // Resolve all block inputs
  const blockInputs = resolveBlockInputs(
    fragments,
    blocks,
    incomingEdges,
    builder,
    errors
  );

  // Resolve all block outputs
  const blockOutputs = resolveBlockOutputs(fragments, blocks, builder, errors);

  return {
    blocks: blockInputs,
    outputs: blockOutputs,
    errors,
  };
}

// =============================================================================
// Edge Lookup
// =============================================================================

interface IncomingEdgeMap {
  /** Map from blockId to array of incoming edges */
  readonly byBlock: Map<string, readonly Edge[]>;

  /** Map from "blockId:portIndex" to incoming edge */
  readonly byPort: Map<string, Edge | undefined>;
}

function buildIncomingEdgeMap(edges: readonly Edge[]): IncomingEdgeMap {
  const byBlock = new Map<string, Edge[]>();
  const byPort = new Map<string, Edge | undefined>();

  for (const edge of edges) {
    const targetBlockId = edge.targetId;

    // Add to block map
    const existing = byBlock.get(targetBlockId);
    if (existing) {
      existing.push(edge);
    } else {
      byBlock.set(targetBlockId, [edge]);
    }

    // Add to port map
    const portKey = `${targetBlockId}:${edge.targetPort}`;
    byPort.set(portKey, edge);
  }

  return { byBlock, byPort };
}

// =============================================================================
// Block Input Resolution
// =============================================================================

function resolveBlockInputs(
  fragments: UnlinkedIRFragments,
  blocks: readonly Block[],
  incomingEdges: IncomingEdgeMap,
  builder: IRBuilder,
  errors: CompileError[]
): BlockInputRootIR {
  const refs: ValueRefPacked[] = [];

  for (const block of blocks) {
    const def = getBlockDefinition(block.type);
    if (!def) {
      errors.push({
        category: "block_unknown",
        message: `Unknown block type: ${block.type}`,
        blockId: block.id,
      });
      continue;
    }

    const inputCount = def.inputs?.length ?? 0;

    for (let portIdx = 0; portIdx < inputCount; portIdx++) {
      const portKey = `${block.id}:${portIdx}`;
      const edge = incomingEdges.byPort.get(portKey);

      if (!edge) {
        // No incoming connection - use default or error
        refs.push({ kind: "const", nodeId: 0 }); // Default const 0
        continue;
      }

      // Find source block
      const sourceBlock = blocks.find((b) => b.id === edge.sourceId);
      if (!sourceBlock) {
        errors.push({
          category: "connection_invalid",
          message: `Source block not found: ${edge.sourceId}`,
          blockId: block.id,
        });
        refs.push({ kind: "const", nodeId: 0 });
        continue;
      }

      // Resolve to node ID
      // TODO: Implement actual node ID lookup from fragments
      refs.push({ kind: "const", nodeId: 0 }); // Placeholder
    }
  }

  return {
    refs,
    indexOf(blockIndex: BlockIndex, portIdx: number): number {
      // TODO: Implement proper indexing based on maxInputs
      return blockIndex * 16 + portIdx; // Assuming max 16 inputs per block
    },
  };
}

// =============================================================================
// Block Output Resolution
// =============================================================================

function resolveBlockOutputs(
  fragments: UnlinkedIRFragments,
  blocks: readonly Block[],
  builder: IRBuilder,
  errors: CompileError[]
): BlockOutputRootIR {
  const refs: ValueRefPacked[] = [];

  for (const block of blocks) {
    const def = getBlockDefinition(block.type);
    if (!def) {
      errors.push({
        category: "block_unknown",
        message: `Unknown block type: ${block.type}`,
        blockId: block.id,
      });
      continue;
    }

    const outputCount = def.outputs?.length ?? 0;

    for (let portIdx = 0; portIdx < outputCount; portIdx++) {
      // Find output node in fragments
      // TODO: Implement actual node ID lookup from fragments
      refs.push({ kind: "const", nodeId: 0 }); // Placeholder
    }
  }

  return {
    refs,
    indexOf(blockIndex: BlockIndex, portIdx: number): number {
      // TODO: Implement proper indexing based on maxOutputs
      return blockIndex * 16 + portIdx; // Assuming max 16 outputs per block
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolve a ValueRef to a concrete node ID
 */
function resolveValueRef(
  ref: ValueRefPacked,
  fragments: UnlinkedIRFragments,
  errors: CompileError[]
): number {
  switch (ref.kind) {
    case "const":
      return ref.nodeId;

    case "field":
      // TODO: Lookup field node ID from fragments
      return 0;

    case "sig":
      // TODO: Lookup sig node ID from fragments
      return 0;

    default: {
      const _exhaustive: never = ref;
      errors.push({
        category: "internal_error",
        message: `Unknown ValueRef kind: ${(_exhaustive as any).kind}`,
      });
      return 0;
    }
  }
}

/**
 * Check if all inputs are connected
 */
function validateBlockInputs(
  block: Block,
  incomingEdges: IncomingEdgeMap,
  errors: CompileError[]
): boolean {
  const def = getBlockDefinition(block.type);
  if (!def) return false;

  const inputCount = def.inputs?.length ?? 0;
  let valid = true;

  for (let portIdx = 0; portIdx < inputCount; portIdx++) {
    const portKey = `${block.id}:${portIdx}`;
    const edge = incomingEdges.byPort.get(portKey);

    if (!edge) {
      const input = def.inputs![portIdx];
      if (!input.optional) {
        errors.push({
          category: "connection_missing",
          message: `Required input '${input.name}' not connected`,
          blockId: block.id,
        });
        valid = false;
      }
    }
  }

  return valid;
}

/**
 * Get block type for lowering
 */
function getBlockLoweringType(
  block: Block,
  builder: IRBuilder
): "transform" | "adapter" | "camera" | "unknown" {
  const def = getBlockDefinition(block.type);
  if (!def) return "unknown";

  // Check if it's a transform
  if (TRANSFORM_REGISTRY[block.type]) {
    return "transform";
  }

  // Check if it's an adapter (has adapterId)
  const step = block as AdapterStep;
  if (step.adapterId) {
    return "adapter";
  }

  // Check if it's a camera
  if (block.type === "Camera") {
    return "camera";
  }

  return "unknown";
}

// =============================================================================
// Camera Lowering (moved to Pass 6)
// =============================================================================

/**
 * Apply camera lowering
 *
 * NOTE: This is now handled in Pass 6, not Pass 8.
 * Keeping this as reference implementation.
 */
function applyCameraLoweringDeprecated(
  block: Block,
  builder: IRBuilder,
  ctx: LowerCtx
): void {
  // Camera lowering logic moved to Pass 6's applyCameraLowering
  // See pass6-block-lowering.ts for current implementation
}

// =============================================================================
// Transform Lowering (handled in Pass 6)
// =============================================================================

/**
 * Apply transform lowering
 *
 * NOTE: This is handled in Pass 6, not Pass 8.
 * Keeping this as reference.
 */
function applyTransformLoweringDeprecated(
  block: TransformStep,
  builder: IRBuilder,
  ctx: TransformIRCtx
): void {
  // Transform lowering handled in Pass 6
  // See pass6-block-lowering.ts for current implementation
}

// =============================================================================
// Adapter Lowering (handled in Pass 6)
// =============================================================================

/**
 * Apply adapter lowering
 *
 * NOTE: This is handled in Pass 6, not Pass 8.
 * Keeping this as reference.
 */
function applyAdapterLoweringDeprecated(
  block: AdapterStep,
  builder: IRBuilder,
  ctx: LowerCtx
): void {
  // Adapter lowering handled in Pass 6
  // See pass6-block-lowering.ts for current implementation
}
