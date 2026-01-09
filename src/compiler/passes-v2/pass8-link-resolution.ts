/**
 * Pass 8: Link Resolution
 *
 * Resolves all ValueRefs to concrete node IDs and creates BlockInputRootIR
 * and BlockOutputRootIR tables.
 *
 * This pass finalizes the IR by ensuring every port has a concrete value
 * and there are no dangling references.
 *
 * Workstream 04: Render Sink Emission Policy (2026-01-03)
 * - Split applyRenderLowering into applyCameraLowering (cameras only)
 * - Render blocks are lowered in pass6, not pass8
 * - Prevents duplicate render sink registration
 *
 * Phase 0.5 Sprint 4: Deprecated Type Cleanup (2026-01-03)
 * - Removed unused _wires parameter (CompilerConnection deprecated)
 * - All connections now use Edge type exclusively
 *

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
 * LinkedGraphIR - Output of Pass 8
 *
 * Complete IR with all ports resolved to concrete values.
 */
export interface LinkedGraphIR {
  /** IRBuilder instance containing all emitted nodes */
  builder: IRBuilder;

  /** Block output port mappings */
  blockOutputRoots: BlockOutputRootIR;

  /** Block input port mappings */
  blockInputRoots: BlockInputRootIR;

  /** Compilation errors */
  errors: CompileError[];
}

// =============================================================================
// Pass 8 Implementation
// =============================================================================

/**
 * Pass 8: Link Resolution
 *
 * Resolves all ports to concrete ValueRefs.
 *
 * Input: UnlinkedIRFragments (from Pass 6) + blocks + edges
 * Output: LinkedGraphIR with complete port mappings
 *
 * For each block:
 * - Output ports: already in blockOutputs from Pass 6
 * - Input ports: resolve via edges
 *
 * Note: Default sources are handled by Pass 0 (materializeDefaultSources),
 * which creates hidden provider blocks and edges for all unconnected inputs
 * with defaultSource metadata. By the time Pass 8 runs, those inputs have
 * edges and don't need special handling.
 */
export function pass8LinkResolution(
  fragments: UnlinkedIRFragments,
  blocks: readonly Block[],
  edges: readonly Edge[]
): LinkedGraphIR {
  const { builder, blockOutputs, errors: inheritedErrors } = fragments;
  const errors: CompileError[] = [...inheritedErrors];

  // Build BlockOutputRootIR from Pass 6 results
  const blockOutputRoots = buildBlockOutputRoots(blocks, blockOutputs);

  // P1 Validation 1: Output Slot Validation
  // BEFORE registerFieldSlots, verify outputs from Pass 6 are properly registered
  // This catches blocks that failed to register their outputs during lowering
  validateOutputSlots(blocks, blockOutputRoots, builder, errors);

  // Safety net: Register field slots that may have been missed
  // This ensures downstream code can rely on field slots being registered
  registerFieldSlots(builder, blockOutputRoots);

  // Build BlockInputRootIR by resolving edges (all port→port connections)
  const blockInputRoots = buildBlockInputRoots(
    blocks,
    blockOutputs,
    builder,
    errors,
    edges
  );

  // Workstream 04: Only apply camera lowering in pass8
  // Render blocks are already lowered in pass6 and register their sinks there
  applyCameraLowering(builder, blocks, blockInputRoots, blockOutputRoots, errors);

  return {
    builder,
    blockOutputRoots,
    blockInputRoots,
    errors,
  };
}

function registerFieldSlots(
  builder: IRBuilder,
  blockOutputRoots: BlockOutputRootIR,
): void {
  for (const ref of blockOutputRoots.refs) {
    if (ref !== undefined && ref.k === "field") {
      builder.registerFieldSlot(ref.id, ref.slot);
    }
  }
}

/**
 * Apply camera lowering in pass8.
 *
 * Camera blocks produce Special<cameraRef> outputs that are needed by
 * render blocks. These must be lowered in pass8 (after input resolution)
 * so that camera outputs are available when render blocks need them.
 *
 * Workstream 04: Split from applyRenderLowering to prevent duplicate
 * render sink registration. Render blocks are lowered in pass6.
 */
function applyCameraLowering(
  builder: IRBuilder,
  blocks: readonly Block[],
  blockInputRoots: BlockInputRootIR,
  blockOutputRoots: BlockOutputRootIR,
  errors: CompileError[],
): void {
  // Process Camera blocks (produce Special<cameraRef> outputs)
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    if (block.type !== "Camera") {
      continue;
    }

    const decl = getBlockType(block.type);
    if (decl === undefined) {
      continue;
    }

    const inputs: ValueRefPacked[] = [];
    let missingInput = false;

    for (const inputDecl of decl.inputs) {
      const blockDef = getBlockDefinition(block.type);
      if (!blockDef) continue;
      const portIdx = blockDef.inputs.findIndex((p) => p.id === inputDecl.portId);
      if (portIdx < 0) {
        // Check if port is optional
        if (inputDecl.optional === true) {
          continue;
        }
        missingInput = true;
        break;
      }
      const ref = blockInputRoots.refs[blockInputRoots.indexOf(blockIdx as BlockIndex, portIdx)];
      if (ref === undefined) {
        // Note: Pass 0 materializes all default sources as hidden provider blocks.
        // If ref is undefined here, the input is either:
        // 1. Optional (skip it)
        // 2. Required but missing (error)
        // No need for defaultSource fallback - that's handled by Pass 0.
        if (inputDecl.optional === true) {
          continue;
        }
        errors.push({
          code: "MissingInput",
          message: `Missing required input for ${block.type}.${inputDecl.portId}. ` +
                   `No edge connection found and no default source was materialized by Pass 0.`,
          where: { blockId: block.id, port: inputDecl.portId },
        });
        missingInput = true;
        break;
      }
      inputs.push(ref);
    }

    if (missingInput) {
      continue;
    }

    const ctx: LowerCtx = {
      blockIdx: blockIdx as BlockIndex,
      blockType: block.type,
      instanceId: block.id,
      label: block.label,
      inTypes: decl.inputs.map((input) => input.type),
      outTypes: decl.outputs.map((output) => output.type),
      b: builder,
      seedConstId: builder.allocConstId(0),
    };

    const result = decl.lower({
      ctx,
      inputs,
      config: block.params,
    });

    // Store Camera outputs in blockOutputRoots for downstream blocks to reference
    if (result.outputs.length > 0) {
      for (let outIdx = 0; outIdx < result.outputs.length; outIdx++) {
        const output = result.outputs[outIdx];
        const outputDecl = decl.outputs[outIdx];
        if (outputDecl !== undefined) {
          const idx = blockOutputRoots.indexOf(blockIdx as BlockIndex, outIdx);
          blockOutputRoots.refs[idx] = output;
        }
      }
    }
  }


  // Workstream 04: Guard against render blocks in pass8
  // Render blocks should be lowered in pass6 (via lowerBlockInstance)
  // If we encounter any here, it indicates a compiler bug
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const decl = getBlockType(block.type);
    if (decl !== undefined && decl.capability === "render") {
      console.warn(
        `[Pass 8] Render block "${block.type}" (${block.id}) encountered in pass8. ` +
        `Render blocks should be lowered in pass6 to avoid duplicate render sink registration. ` +
        `This is likely a compiler bug.`
      );
    }
  }
}

/**
 * Build BlockOutputRootIR from Pass 6 blockOutputs.
 */
function buildBlockOutputRoots(
  blocks: readonly Block[],
  blockOutputs: Map<number, Map<string, ValueRefPacked>>
): BlockOutputRootIR {
  const refs: ValueRefPacked[] = [];

  // Calculate max outputs for indexing
  const maxOutputs = Math.max(...blocks.map((b) => getBlockDefinition(b.type)?.outputs.length ?? 0), 0);

  // Create flat array indexed by (blockIdx * maxOutputs + portIdx)
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const outputs = blockOutputs.get(blockIdx);

    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;
    for (let portIdx = 0; portIdx < blockDef.outputs.length; portIdx++) {
      const portId = blockDef.outputs[portIdx].id;
      const ref = outputs?.get(portId);
      if (ref !== undefined) {
        refs[blockIdx * maxOutputs + portIdx] = ref;
      }
    }
  }

  return {
    refs,
    indexOf: (blockIndex: BlockIndex, portIdx: number) => {
      return (blockIndex as number) * maxOutputs + portIdx;
    },
  };
}

// =============================================================================
// Transform Application (Phase 2: Unified IR Dispatcher)
// =============================================================================

/**
 * Get transform steps from an edge.
 *
 * All edges must have a 'transforms' field - no legacy format support.
 */
function getEdgeTransforms(edge: Edge): readonly TransformStep[] {
  return edge.transforms ?? [];
}

/**
 * Apply a single transform step to a value reference in IR mode.
 *
 * Phase 2 Deliverable: Unified single-step IR application.
 * Works identically for adapters and lenses.
 *
 * Note: This function handles the TransformStep format where:
 * - Adapters are AdapterStep (no 'kind' field)
 * - Lenses are { kind: 'lens', lens: LensInstance }
 *
 * @param valueRef - Input value reference
 * @param step - Transform step (adapter or lens)
 * @param builder - IR builder for creating new IR nodes
 * @param errors - Array to collect compilation errors
 * @param context - Human-readable context for error messages
 * @returns Transformed value reference (or original if transform fails)
 */
function applyTransformStepIR(
  valueRef: ValueRefPacked,
  step: TransformStep,
  builder: IRBuilder,
  errors: CompileError[],
  context: string
): ValueRefPacked {
  // Discriminate between adapter and lens using 'kind' field
  const isLens = 'kind' in step && step.kind === 'lens';

  // Check if lens is disabled (adapters don't have enabled field yet)
  if (isLens && step.lens.enabled === false) {
    return valueRef;
  }

  // Get transform ID based on type
  const transformId = isLens ? step.lens.lensId : (step as AdapterStep).adapterId ?? (step as AdapterStep).adapter;

  // Get transform definition from registry
  const transformDef = TRANSFORM_REGISTRY.getTransform(transformId);

  if (transformDef === undefined) {
    const transformKind = isLens ? 'lens' : 'adapter';
    const errorCode = isLens ? 'UnsupportedLensInIRMode' : 'UnsupportedAdapterInIRMode';
    errors.push({
      code: errorCode,
      message: `Unknown ${transformKind} '${transformId}' in ${context}. This ${transformKind} is not registered.`,
    });
    return valueRef; // Continue with original value
  }

  // Validate transform kind matches step type
  const expectedKind = isLens ? 'lens' : 'adapter';
  if (transformDef.kind !== expectedKind) {
    const errorCode = isLens ? 'UnsupportedLensInIRMode' : 'UnsupportedAdapterInIRMode';
    errors.push({
      code: errorCode,
      message: `Transform '${transformDef.label}' used in ${context} is not a ${expectedKind} (it's a ${transformDef.kind}).`,
    });
    return valueRef;
  }

  // Check if transform supports IR compilation
  if (transformDef.compileToIR === undefined) {
    const errorCode = isLens ? 'UnsupportedLensInIRMode' : 'UnsupportedAdapterInIRMode';
    const helpText = isLens
      ? `This lens requires stateful operation or special runtime handling that hasn't been implemented in the IR compiler.`
      : `This adapter requires special runtime handling that hasn't been implemented in the IR compiler.`;

    errors.push({
      code: errorCode,
      message: `${expectedKind.charAt(0).toUpperCase() + expectedKind.slice(1)} '${transformDef.label}' used in ${context} is not yet supported in IR compilation mode. ` +
               `${helpText} ` +
               `Remove this ${expectedKind} from your connection or use an alternative if available.`,
    });
    return valueRef; // Continue with original value
  }

  // Resolve parameters based on transform type
  const paramsMap: Record<string, ValueRefPacked> = {};
  let irCtx: TransformIRCtx;

  if (isLens) {
    // Lenses: convert params to ValueRefPacked
    const lens = step.lens;
    for (const [paramId, binding] of Object.entries(lens.params)) {
      if (typeof binding === 'object' && binding !== null && 'kind' in binding && binding.kind === 'literal') {
        // Convert literal values to scalar constants
        const constId = builder.allocConstId(binding.value);
        paramsMap[paramId] = { k: 'scalarConst', constId };
      }
    }

    irCtx = {
      builder,
      transformId,
      params: lens.params,
    };
  } else {
    // Adapters: params are simple Record<string, unknown>
    const adapterStep = step as AdapterStep;
    irCtx = {
      builder,
      transformId,
      params: adapterStep.params,
    };
    // Adapters don't use paramsMap in IR mode (they use ctx.params)
  }

  // Apply the transform's IR compilation
  const transformed = transformDef.compileToIR(valueRef, paramsMap, irCtx);
  if (transformed === null) {
    const errorCode = isLens ? 'UnsupportedLensInIRMode' : 'UnsupportedAdapterInIRMode';
    const reason = isLens
      ? `The input type may be incompatible with this lens, or the lens parameters are not yet supported.`
      : `The input type may be incompatible with this adapter.`;

    errors.push({
      code: errorCode,
      message: `${expectedKind.charAt(0).toUpperCase() + expectedKind.slice(1)} '${transformDef.label}' in ${context} failed to compile to IR. ${reason}`,
    });
    return valueRef; // Continue with original value
  }

  return transformed;
}

/**
 * Apply a sequence of transform steps to a value reference in IR mode.
 *
 * Phase 2 Deliverable: Unified IR dispatcher that iterates transform chain.
 * Single entry point for all IR transform application.
 *
 * @param valueRef - Input value reference to transform
 * @param transforms - Array of transform steps to apply in order
 * @param builder - IR builder for creating new IR nodes
 * @param errors - Array to collect compilation errors
 * @param context - Human-readable context for error messages
 * @returns Transformed value reference (or original if transforms fail)
 */
function applyTransformsIR(
  valueRef: ValueRefPacked,
  transforms: readonly TransformStep[],
  builder: IRBuilder,
  errors: CompileError[],
  context: string
): ValueRefPacked {
  let result = valueRef;

  for (const step of transforms) {
    result = applyTransformStepIR(result, step, builder, errors, context);
  }

  return result;
}

/**
 * Build BlockInputRootIR by resolving input sources.
 *
 * If no source is found (no edge), it's a missing required input error.
 */
function buildBlockInputRoots(
  blocks: readonly Block[],
  blockOutputs: Map<number, Map<string, ValueRefPacked>>,
  builder: IRBuilder,
  errors: CompileError[],
  edges: readonly Edge[]
): BlockInputRootIR {
  const refs: ValueRefPacked[] = [];

  // Calculate max inputs for indexing
  const maxInputs = Math.max(...blocks.map((b) => getBlockDefinition(b.type)?.inputs.length ?? 0), 0);

  // Create a map from blockId to blockIndex for lookups
  const blockIdToIndex = new Map<string, number>();
  blocks.forEach((block, idx) => {
    blockIdToIndex.set(block.id, idx);
  });

  // Process each block's inputs
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];

    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;
    for (let portIdx = 0; portIdx < blockDef.inputs.length; portIdx++) {
      const input = blockDef.inputs[portIdx];
      const flatIdx = blockIdx * maxInputs + portIdx;

      let resolved = false;

      // All edges are port→port after Sprint 2 migration
      // No edge-kind discrimination needed - all edges handled uniformly
      const edge = edges.find(
        (e) => e.to.kind === 'port' && e.to.blockId === block.id && e.to.slotId === input.id
      );

      if (edge !== undefined) {
        // All edges are port→port after migration
        // Resolve upstream block output
        const upstreamBlockIdx = blockIdToIndex.get(edge.from.blockId);

        if (upstreamBlockIdx === undefined) {
          errors.push({
            code: "DanglingConnection",
            message: `Edge to ${block.id}:${input.id} from unknown block ${edge.from.blockId}`,
          });
          continue;
        }

        const upstreamOutputs = blockOutputs.get(upstreamBlockIdx);
        let ref = upstreamOutputs?.get(edge.from.slotId);

        if (ref !== undefined) {
          // Phase 2: Use unified IR transform application
          const transforms = getEdgeTransforms(edge);
          if (transforms.length > 0) {
            ref = applyTransformsIR(
              ref,
              transforms,
              builder,
              errors,
              `edge to ${block.type}.${input.id}`
            );
          }

          refs[flatIdx] = ref;
          resolved = true;
          continue;
        }

        // Edge exists but upstream port has no IR representation
        // This is expected for non-IR types (events, domains, etc.)
        resolved = true;
        continue;
      }

      // If not resolved via edge, check if it's a scalar or optional
      if (!resolved) {
        // Note: Pass 0 (materializeDefaultSources) creates hidden provider blocks
        // for all unconnected inputs with defaultSource metadata. By the time we
        // reach this point, those inputs already have edges. If we're here, either:
        // 1. The input is scalar (compile-time config, not runtime IR)
        // 2. The input is optional (can be missing)
        // 3. The input is required and missing (error)

        const blockDef = getBlockType(block.type);
        const inputDef = blockDef?.inputs.find(i => i.portId === input.id);

        // Check if this is a scalar input that doesn't need IR resolution
        // Scalars are compile-time config values passed via block.params
        if (inputDef?.type.world === "scalar") {
          continue; // Successfully resolved via config
        }

        // No edge and not a scalar - this is a missing required input
        // Report error unless the input is marked as optional
        if (inputDef?.optional !== true) {
          errors.push({
            code: "MissingInput",
            message: `Missing required input for ${block.type}.${input.id}. ` +
                     `No edge connection and no default source was materialized by Pass 0. ` +
                     `Ensure the input is either connected, has a defaultSource in the block definition, or is marked optional.`,
            where: { blockId: block.id, port: input.id },
          });
        }
      }
    }
  }

  return {
    refs,
    indexOf: (blockIndex: BlockIndex, portIdx: number) => {
      return (blockIndex as number) * maxInputs + portIdx;
    },
  };
}

/**
 * P1 Validation 1: Output Slot Validation
 *
 * After all blocks are lowered, verify that block outputs are properly registered in IR.
 * Emits MissingOutputRegistration diagnostic if an output has no slot registration.
 */
function validateOutputSlots(
  blocks: readonly Block[],
  blockOutputRoots: BlockOutputRootIR,
  builder: IRBuilder,
  errors: CompileError[]
): void {
  // Get the built IR to access slot registrations
  const ir = builder.build();

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];

    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;
    for (let portIdx = 0; portIdx < blockDef.outputs.length; portIdx++) {
      const output = blockDef.outputs[portIdx];
      const idx = blockOutputRoots.indexOf(blockIdx as BlockIndex, portIdx);
      const ref = blockOutputRoots.refs[idx];

      // Skip undefined outputs (not all outputs produce IR)
      if (ref === undefined) {
        continue;
      }

      // Check if the slot is registered based on ValueRef kind
      let isRegistered = false;

      if (ref.k === 'sig') {
        // Signal: check sigValueSlots array
        isRegistered = ir.sigValueSlots[ref.id] !== undefined;
      } else if (ref.k === 'field') {
        // Field: check fieldValueSlots array
        isRegistered = ir.fieldValueSlots[ref.id] !== undefined;
      } else if (ref.k === 'scalarConst') {
        // ScalarConst: check constants array
        isRegistered = ref.constId < ir.constants.length;
      } else if (ref.k === 'special') {
        // Special types don't need slot registration (config-time only)
        isRegistered = true;
      }

      if (!isRegistered) {
        // Try to get block type declaration for better error messages
        const blockDecl = getBlockType(block.type);
        const outputDecl = blockDecl?.outputs.find(o => o.portId === output.id);

        errors.push({
          code: "MissingOutputRegistration",
          message: `Block '${block.label !== "" ? block.label : block.id}' output '${output.label !== "" ? output.label : output.id}' (type: ${ref.k}) has no slot registration. ` +
                   `This indicates a compiler bug - the block lowering function should call registerSigSlot() or registerFieldSlot().`,
          where: {
            blockId: block.id,
            port: output.id,
            blockType: block.type,
            outputType: outputDecl?.type
          },
        });
      }
    }
  }
}
