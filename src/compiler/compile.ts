/**
 * Compiler Entry Point
 *
 * Main compilation pipeline:
 * 1. Normalization - Convert Patch to NormalizedPatch
 * 2. Pass 2: Type Graph - Resolve types for all connections
 * 3. Pass 3: Time Topology - Determine time model
 * 4. Pass 4: Dependency Graph - Build execution dependencies
 * 5. Pass 5: Cycle Validation (SCC) - Check for illegal cycles
 * 6. Pass 6: Block Lowering - Lower blocks to IR expressions
 * 7. Pass 7: Schedule Construction - Build execution schedule
 * 8. Kernel Resolution - Resolve kernel names to handles (Phase B)
 *
 * Integrated with event emission for diagnostics.
 */

import type { Patch } from '../graph';
import { normalize, type NormalizedPatch } from '../graph/normalize';
import type { CompiledProgramIR, SlotMetaEntry, ValueSlot, FieldSlotEntry, OutputSpecIR, ExprProvenanceIR, ExprUserTarget } from './ir/program';
import type { BlockId } from '../types';
import type { UnlinkedIRFragments } from './backend/lower-blocks';
import type { ScheduleIR } from './backend/schedule-program';
import type { AcyclicOrLegalGraph } from './ir/patches';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';
import type { EventHub } from '../events/EventHub';
import {canonicalType, isMany, requireManyInstance, payloadStride} from '../core/canonical-types';
import type { ValueExpr, ValueExprId } from './ir/value-expr';
import type { Step } from './ir/types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../core/canonical-types';
// debugService import removed for strict compiler isolation (One Source of Truth)
import { compilationInspector } from '../services/CompilationInspectorService';
import { computeRenderReachableBlocks } from './reachability';
import { resolveKernels } from './resolve-kernels';
import { createDefaultRegistry } from '../runtime/kernels/default-registry';
import { partitionByFlags, getDefaultDiagnosticFlags, type DiagnosticSeverityOverride } from './diagnostic-flags';
import type { TypeConstraintError, PortKey } from './frontend/analyze-type-constraints';
import { unitScalar } from '../core/canonical-types/units';
import type { FrontendResult } from './frontend';



// Import all block registrations (side-effect import)
import '../blocks/all';

// Import passes
import { pass1TypeConstraints } from './frontend/analyze-type-constraints';
import { pass2TypeGraph } from './frontend/analyze-type-graph';
import { pass3Time } from './backend/derive-time-model';
import { pass4DepGraph } from './backend/derive-dep-graph';
import { pass5CycleValidation } from './backend/schedule-scc';
import { pass6BlockLowering } from './backend/lower-blocks';
import { pass7Schedule } from './backend/schedule-program';
import { AddressRegistry } from '../graph/address-registry';

// =============================================================================
// Compile Errors & Results
// =============================================================================

export interface CompileError {
  readonly kind: string;
  readonly message: string;
  readonly blockId?: string;
  readonly connectionId?: string;
  readonly portId?: string;
}

export type CompileSuccess = {
  readonly kind: 'ok';
  readonly program: CompiledProgramIR;
};

export type CompileFailure = {
  readonly kind: 'error';
  readonly errors: readonly CompileError[];
};

export type CompileResult = CompileSuccess | CompileFailure;

// =============================================================================
// Compile Options
// =============================================================================

export interface CompileOptions {
  readonly patchId?: string;
  readonly patchRevision?: number;
  readonly events: EventHub;
  readonly diagnosticFlags?: Record<string, DiagnosticSeverityOverride>;
  /** Precomputed frontend result (normalization + type resolution). When provided, compile() skips inline frontend passes. */
  readonly precomputedFrontend?: FrontendResult;

}

// =============================================================================
// Main Compile Function
// =============================================================================

/**
 * Compile a Patch into a CompiledProgramIR.
 *
 * @param patch - The patch to compile
 * @param options - Optional compile options for event emission
 * @returns CompileResult with either the compiled program or errors
 */
export function compile(patch: Patch, options?: CompileOptions): CompileResult {
  const compileId = options?.patchId ? `${options.patchId}:${options.patchRevision || 0}` : 'unknown';
  const startTime = performance.now();

  // Begin compilation inspection
  try {
    compilationInspector.beginCompile(compileId);
  } catch (e) {
    console.warn('[CompilationInspector] Failed to begin compile:', e);
  }

  // Emit CompileBegin event
  if (options) {
    options.events.emit({
      type: 'CompileBegin',
      compileId,
      patchId: options.patchId || 'unknown',
      patchRevision: options.patchRevision || 0,
      trigger: 'manual',
    });
  }

  try {
    let normalized: NormalizedPatch;
    let typedPatch: ReturnType<typeof pass2TypeGraph>;
    let flagWarnings: TypeConstraintError[] = [];

    // =========================================================================
    // Frontend: Use precomputed result or run inline
    // =========================================================================
    if (options?.precomputedFrontend) {
      // Reuse precomputed frontend result
      normalized = options.precomputedFrontend.normalizedPatch;
      typedPatch = options.precomputedFrontend.typedPatch;

      // Capture precomputed passes (for inspection)
      try {
        compilationInspector.capturePass('normalization', patch, normalized);
        compilationInspector.capturePass('type-constraints', normalized, typedPatch);
        compilationInspector.capturePass('type-graph', normalized, typedPatch);
      } catch (e) {
        console.warn('[CompilationInspector] Failed to capture precomputed frontend:', e);
      }
    } else {
      // Run frontend inline (original monolithic path)
      // Pass 1: Normalization
      const normResult = normalize(patch);

      if (normResult.kind === 'error') {
        const compileErrors: CompileError[] = normResult.errors.map((e) => {
          switch (e.kind) {
            case 'DanglingEdge':
              return {
                kind: e.kind,
                message: `Edge references missing block (${e.missing})`,
                blockId: e.edge.from.blockId,
              };
            case 'DuplicateBlockId':
              return {
                kind: e.kind,
                message: `Duplicate block ID: ${e.id}`,
                blockId: e.id,
              };
            case 'UnknownPort':
              return {
                kind: 'UnknownBlockType',
                message: `Port '${e.portId}' does not exist on block '${e.blockId}' (${e.direction})`,
                blockId: e.blockId,
                portId: e.portId,
              };
            case 'NoAdapterFound':
              return {
                kind: 'TypeMismatch',
                message: `No adapter found for type conversion: ${e.fromType} → ${e.toType}`,
                blockId: e.edge.to.blockId,
                portId: e.edge.to.slotId,
              };
            case 'vararg':
              return {
                kind: 'VarargError',
                message: e.message,
                blockId: e.where.blockId,
                portId: e.where.portId,
              };
            case 'CompositeExpansion':
              return {
                kind: 'CompositeExpansion',
                message: e.message,
                blockId: e.compositeBlockId,
                code: e.code,
              };
            default: {
              const _exhaustive: never = e;
              return {
                kind: 'UnknownBlockType',
                message: `Unknown normalization error: ${JSON.stringify(_exhaustive)}`,
              };
            }
          }
        });

        return emitFailure(options, startTime, compileId, compileErrors);
      }

      normalized = normResult.patch;

      // Capture normalization pass
      try {
        compilationInspector.capturePass('normalization', patch, normalized);
      } catch (e) {
        console.warn('[CompilationInspector] Failed to capture normalization:', e);
      }

      // Pass 1: Type Constraints (unit and payload inference)
      // Resolves polymorphic unit and payload variables through constraint propagation
      // Output is TypeResolvedPatch - THE source of truth for all port types
      const pass1Result = pass1TypeConstraints(normalized);
      // Track block indices that had pass1 errors filtered out (unreachable)
      const pass1FilteredBlockIndices = new Set<number>();
      if (pass1Result.errors.length > 0) {
        const { errors: fatalErrors, warnings } = partitionByFlags(
          pass1Result.errors,
          options?.diagnosticFlags,
        );
        flagWarnings = warnings;
        if (fatalErrors.length > 0) {
          // Apply reachability filtering: errors on blocks not reachable from
          // render blocks become warnings. Only applies when the patch has
          // render blocks — if there are no render blocks, all errors are fatal
          // (there's no output to isolate errors from).
          const reachableBlocks = computeRenderReachableBlocks(
            normalized.blocks,
            normalized.edges
          );
          let reachableFatalErrors: typeof fatalErrors;
          if (reachableBlocks.size === 0) {
            // No render blocks: all errors are fatal (no error isolation)
            reachableFatalErrors = fatalErrors;
          } else {
            reachableFatalErrors = [];
            for (const e of fatalErrors) {
              if (reachableBlocks.has(e.blockIndex as import('./ir/patches').BlockIndex)) {
                reachableFatalErrors.push(e);
              } else {
                pass1FilteredBlockIndices.add(e.blockIndex);
              }
            }
          }
          if (reachableFatalErrors.length > 0) {
            const compileErrors: CompileError[] = reachableFatalErrors.map((e) => ({
              kind: e.kind,
              message: `${e.message}\nSuggestions:\n${e.suggestions.map((s: string) => `  - ${s}`).join('\n')}`,
              blockId: normalized.blocks[e.blockIndex]?.id,
              portId: e.portName,
            }));
            return emitFailure(options, startTime, compileId, compileErrors);
          }
        }
      }

      // Unitless fallback: when ConflictingUnits is downgraded to warning,
      // replace the conflicting unit with unitScalar (unitless)
      let typeResolved = pass1Result;
      if (flagWarnings.some((w) => w.kind === 'ConflictingUnits')) {
        const patchedPortTypes = new Map(pass1Result.portTypes);
        for (const w of flagWarnings) {
          if (w.kind === 'ConflictingUnits') {
            const key = `${w.blockIndex}:${w.portName}:${w.direction}` as PortKey;
            const existing = patchedPortTypes.get(key);
            if (existing) {
              patchedPortTypes.set(key, { ...existing, unit: unitScalar() });
            }
          }
        }
        typeResolved = { ...pass1Result, portTypes: patchedPortTypes };
      }

      try {
        compilationInspector.capturePass('type-constraints', normalized, typeResolved);
      } catch (e) {
        console.warn('[CompilationInspector] Failed to capture type-constraints:', e);
      }

      // Pass 2: Type Graph (validates types using resolved types from pass1)
      try {
        typedPatch = pass2TypeGraph(typeResolved);
      } catch (pass2Error) {
        // Pass 2 may fail due to unresolved types on blocks that had pass 1 errors filtered out.
        // Only suppress if ALL error-referenced blocks had their pass 1 errors filtered.
        if (pass1FilteredBlockIndices.size === 0) {
          throw pass2Error; // No filtered blocks — all pass 2 errors are genuine
        }
        // Check if error only references blocks that had pass 1 errors filtered
        const errMsg = (pass2Error as Error).message || '';
        const blockRefPattern = /block\[(\d+)\]/g;
        let match: RegExpExecArray | null;
        let allFiltered = true;
        while ((match = blockRefPattern.exec(errMsg)) !== null) {
          const blockIdx = parseInt(match[1], 10);
          if (!pass1FilteredBlockIndices.has(blockIdx)) {
            allFiltered = false;
            break;
          }
        }
        if (!allFiltered) {
          throw pass2Error; // Some blocks with pass 2 errors weren't filtered in pass 1
        }
        // All pass 2 errors are on blocks that already had pass 1 errors filtered — continue
        typedPatch = {
          ...typeResolved,
          blockOutputTypes: new Map(),
        };
      }

      try {
        compilationInspector.capturePass('type-graph', normalized, typedPatch);
      } catch (e) {
        console.warn('[CompilationInspector] Failed to capture type-graph:', e);
      }
    }

    // =========================================================================
    // Backend: Always runs (requires frontend output)
    // =========================================================================

    // Pass 3: Time Topology
    const timeResolvedPatch = pass3Time(typedPatch);

    try {
      compilationInspector.capturePass('time', typedPatch, timeResolvedPatch);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture time:', e);
    }

    // Pass 4: Dependency Graph
    const depGraphPatch = pass4DepGraph(timeResolvedPatch);

    try {
      compilationInspector.capturePass('depgraph', timeResolvedPatch, depGraphPatch);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture depgraph:', e);
    }

    // Pass 5: Cycle Validation (SCC)
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    try {
      compilationInspector.capturePass('scc', depGraphPatch, acyclicPatch);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture scc:', e);
    }

    // Pass 6: Block Lowering
    const addressRegistry = AddressRegistry.buildFromPatch(normalized.patch);
    const unlinkedIR = pass6BlockLowering(acyclicPatch, {
      events: options?.events,
      compileId,
      patchRevision: options?.patchRevision,
      addressRegistry,
    });

    try {
      compilationInspector.capturePass('block-lowering', acyclicPatch, unlinkedIR);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture block-lowering:', e);
    }

    // Check for errors from pass 6 - Filter by reachability
    // Collect warnings for unreachable blocks to include in CompileEnd event
    let unreachableBlockWarnings: Array<{
      id: string;
      code: 'W_BLOCK_UNREACHABLE_ERROR';
      severity: 'warn';
      domain: 'compile';
      primaryTarget: { kind: 'block'; blockId: string };
      title: string;
      message: string;
      scope: { patchRevision: number; compileId: string };
      metadata: { firstSeenAt: number; lastSeenAt: number; occurrenceCount: number };
    }> = [];

    if (unlinkedIR.errors.length > 0) {
      // Compute which blocks are reachable from render blocks
      const reachableBlocks = computeRenderReachableBlocks(
        acyclicPatch.blocks,
        acyclicPatch.edges
      );

      // Build blockId → blockIndex map
      const blockIdToIndex = new Map<string, number>();
      for (let i = 0; i < acyclicPatch.blocks.length; i++) {
        blockIdToIndex.set(acyclicPatch.blocks[i].id, i);
      }

      // Partition errors into reachable and unreachable
      const reachableErrors: import('./types').CompileError[] = [];
      const unreachableErrors: import('./types').CompileError[] = [];

      for (const error of unlinkedIR.errors) {
        const blockIdx = error.where?.blockId
          ? blockIdToIndex.get(error.where.blockId)
          : undefined;

        // Error is reachable if:
        // 1. It has no blockId (global error), OR
        // 2. The block is in the reachable set
        if (blockIdx === undefined || reachableBlocks.has(blockIdx as import('./ir/patches').BlockIndex)) {
          reachableErrors.push(error);
        } else {
          unreachableErrors.push(error);
        }
      }

      // Build warning diagnostics for unreachable block errors
      // These will be emitted with the CompileEnd event so DiagnosticHub can process them
      if (unreachableErrors.length > 0 && options) {
        unreachableBlockWarnings = unreachableErrors.map((error) => ({
          id: `W_BLOCK_UNREACHABLE_ERROR:${error.where?.blockId}:rev${options.patchRevision || 0}`,
          code: 'W_BLOCK_UNREACHABLE_ERROR' as const,
          severity: 'warn' as const,
          domain: 'compile' as const,
          primaryTarget: { kind: 'block' as const, blockId: error.where?.blockId || 'unknown' },
          title: `Unreachable Block Error: ${error.code}`,
          message: `Block '${error.where?.blockId || 'unknown'}' has error but is not connected to render pipeline: ${error.message}\n\nSuggestion: Connect this block to the render pipeline or remove it.`,
          scope: { patchRevision: options.patchRevision || 0, compileId },
          metadata: {
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
            occurrenceCount: 1,
          },
        }));
      }

      // Only fail compilation if there are reachable errors
      if (reachableErrors.length > 0) {
        const compileErrors: CompileError[] = reachableErrors.map((e) => ({
          kind: e.code,
          message: e.message,
          blockId: e.where?.blockId,
        }));
        return emitFailure(options, startTime, compileId, compileErrors);
      }
    }


    // Pass 7: Schedule Construction
    const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch);

    try {
      compilationInspector.capturePass('schedule', unlinkedIR, scheduleIR);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture schedule:', e);
    }

    // Phase B: Kernel Resolution
    // Create default registry and resolve all kernel references to handles
    const registry = createDefaultRegistry();
    // Cast to mutable: we need to mutate PureFn nodes to add handles
    const valueExprs = unlinkedIR.builder.getValueExprs() as ValueExpr[];
    const kernelResolutionErrors = resolveKernels(valueExprs, registry);

    if (kernelResolutionErrors.length > 0) {
      const compileErrors: CompileError[] = kernelResolutionErrors.map((e) => ({
        kind: e.kind,
        message: e.message,
      }));
      return emitFailure(options, startTime, compileId, compileErrors);
    }

    // Convert to CompiledProgramIR (now with registry)
    const compiledIR = convertLinkedIRToProgram(unlinkedIR, scheduleIR, acyclicPatch, registry);

    // Build edge-to-slot map logic removed from compiler (migrated to main.ts)


    // End compilation inspection (success)
    try {
      compilationInspector.endCompile('success');
    } catch (e) {
      console.warn('[CompilationInspector] Failed to end compile:', e);
    }

    // Emit CompileEnd event (success)
    // Include warnings for unreachable blocks that had errors (they didn't block compilation)
    if (options) {
      const durationMs = performance.now() - startTime;
      const successDiagnostic = {
        id: `compile-success:rev${options.patchRevision || 0}`,
        code: 'I_COMPILE_SUCCESS' as const,
        severity: 'info' as const,
        domain: 'compile' as const,
        primaryTarget: { kind: 'graphSpan' as const, blockIds: [] },
        title: 'Compilation Successful',
        message: `Compiled in ${durationMs.toFixed(1)}ms`,
        scope: { patchRevision: options.patchRevision || 0, compileId },
        metadata: {
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          occurrenceCount: 1,
        },
      };
      // Flag warning diagnostics (errors downgraded to warnings by user settings)
      const flagWarningDiagnostics = flagWarnings.map((w) => ({
        id: `W_FLAG_DOWNGRADED:${w.kind}:${normalized.blocks[w.blockIndex]?.id}:${w.portName}:rev${options.patchRevision || 0}`,
        code: 'W_FLAG_DOWNGRADED' as const,
        severity: 'warn' as const,
        domain: 'compile' as const,
        primaryTarget: {
          kind: 'port' as const,
          blockId: normalized.blocks[w.blockIndex]?.id || 'unknown',
          portId: w.portName,
        },
        title: `${w.kind} (downgraded to warning)`,
        message: `${w.message}\n\nThis error was downgraded to a warning by compiler flag settings.`,
        scope: { patchRevision: options.patchRevision || 0, compileId },
        metadata: { firstSeenAt: Date.now(), lastSeenAt: Date.now(), occurrenceCount: 1 },
      }));
      const diagnostics = [successDiagnostic, ...unreachableBlockWarnings, ...flagWarningDiagnostics];
      options.events.emit({
        type: 'CompileEnd',
        compileId,
        patchId: options.patchId || 'unknown',
        patchRevision: options.patchRevision || 0,
        status: 'success',
        durationMs,
        diagnostics,
      });
    }

    return {
      kind: 'ok',
      program: compiledIR,
    };
  } catch (e: unknown) {
    // Catch errors from any pass
    const error = e instanceof Error ? e : new Error(String(e));
    const errorKind = (e as { code?: string }).code || 'CompilationFailed';
    const errorMessage = error.message || 'Unknown compilation error';

    const compileErrors: CompileError[] = [{
      kind: errorKind,
      message: errorMessage,
    }];

    // End compilation inspection (failure)
    try {
      compilationInspector.endCompile('failure');
    } catch (e2) {
      console.warn('[CompilationInspector] Failed to end compile:', e2);
    }

    return emitFailure(options, startTime, compileId, compileErrors);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function emitFailure(
  options: CompileOptions | undefined,
  startTime: number,
  compileId: string,
  errors: CompileError[]
): CompileFailure {
  // End compilation inspection (failure) if not already called
  try {
    if (compilationInspector['currentSnapshot']) {
      compilationInspector.endCompile('failure');
    }
  } catch (e) {
    console.warn('[CompilationInspector] Failed to end compile:', e);
  }

  if (options) {
    const durationMs = performance.now() - startTime;
    const diagnostics = convertCompileErrorsToDiagnostics(errors, options.patchRevision || 0, compileId);
    options.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: options.patchId || 'unknown',
      patchRevision: options.patchRevision || 0,
      status: 'failure',
      durationMs,
      diagnostics,
    });
  }

  return {
    kind: 'error',
    errors,
  };
}

/**
 * Convert LinkedIR and ScheduleIR to CompiledProgramIR.
 *
 * @param unlinkedIR - Unlinked IR fragments from Pass 6
 * @param scheduleIR - Execution schedule from Pass 7
 * @param acyclicPatch - Acyclic patch for debug index
 * @param registry - Kernel registry (Phase B)
 * @returns CompiledProgramIR
 */
function convertLinkedIRToProgram(
  unlinkedIR: UnlinkedIRFragments,
  scheduleIR: ScheduleIR,
  acyclicPatch: AcyclicOrLegalGraph,
  registry: import('../runtime/KernelRegistry').KernelRegistry
): CompiledProgramIR {
  // Extract data from the IR builder (ValueExpr-only)
  const builder = unlinkedIR.builder;
  const valueExprNodes = builder.getValueExprs();

  // Build fieldSlotRegistry from blockOutputs (field outputs that can be materialized on demand)
  const fieldSlotRegistry = new Map<ValueSlot, FieldSlotEntry>();
  const fieldSlotSet = new Set<number>(); // Track which slots are field outputs
  if (unlinkedIR.blockOutputs) {
    for (const [, outputs] of unlinkedIR.blockOutputs.entries()) {
      for (const [, ref] of outputs.entries()) {
        // Treat ref.id as ValueExprId and infer field instance
        const valueId = ref.id as unknown as ValueExprId;
        const instanceId = inferFieldInstanceFromValueExprs(valueId, valueExprNodes);
        if (instanceId) {
          fieldSlotRegistry.set(ref.slot!, { fieldId: valueId, instanceId });
          fieldSlotSet.add(ref.slot! as number);
        }
      }
    }
  }

  // Build slot metadata from slot types
  const slotTypes = builder.getSlotMetaInputs();
  const slotMeta: SlotMetaEntry[] = [];

  // Track offsets per storage class
  const storageOffsets = {
    f64: 0,
    f32: 0,
    i32: 0,
    u32: 0,
    object: 0,
    shape2d: 0,
  };

  // Build slotMeta entries for all allocated slots
  // Slots are indexed from 0, so iterate through all slot IDs
  for (let slotId = 0; slotId < (builder.getSlotCount?.() || 0); slotId++) {
    const slot = slotId as ValueSlot;
    const slotInfo = slotTypes.get(slot);
    const type = slotInfo?.type || canonicalType(FLOAT); // Default to float if no type info

    // Determine storage class from type
    // Field output slots store buffer references in the objects Map
    // Shape payloads use dedicated shape2d bank; all other signals go to f64
    const storage: SlotMetaEntry['storage'] = fieldSlotSet.has(slotId)
      ? 'object'
      : 'f64'; // TODO: Q6 — shape2d storage removed with shape payload; will use resource graph

    // Use stride from slotInfo (which comes from registered type), fallback to computing from payload
    // Objects/fields have stride=1 since they store a single reference
    const stride = storage === 'object' ? 1 : (slotInfo?.stride ?? payloadStride(type.payload));

    // Offset must increment by stride, not 1 - multi-component types (color=4, vec3=3, vec2=2) need space
    const offset = storageOffsets[storage];
    storageOffsets[storage] += stride;

    slotMeta.push({
      slot,
      storage,
      offset,
      stride,
      type,
    });
  }

  // Add slotMeta entries for slots allocated by Pass 7 (continuity pipeline buffers).
  // These slots store object references (Float32Array buffers) and start after the builder's slot range.
  const builderSlotCount = builder.getSlotCount?.() || 0;
  const steps = scheduleIR.steps;
  let maxSlotUsed = builderSlotCount - 1;
  for (const step of steps) {
    if (step.kind === 'materialize' && (step.target as number) >= builderSlotCount) {
      maxSlotUsed = Math.max(maxSlotUsed, step.target as number);
    }
    if (step.kind === 'continuityApply') {
      maxSlotUsed = Math.max(maxSlotUsed, step.baseSlot as number, step.outputSlot as number);
    }
  }
  for (let slotId = builderSlotCount; slotId <= maxSlotUsed; slotId++) {
    slotMeta.push({
      slot: slotId as ValueSlot,
      storage: 'object',
      offset: storageOffsets.object++,
      stride: 1, // Object slots store a single reference
      type: canonicalType(FLOAT),
    });
  }

  // Build output specs
  // Allocate a slot for the render frame output (RenderFrameIR object)
  const renderFrameSlot = (maxSlotUsed + 1) as ValueSlot;

  // Add SlotMetaEntry for render frame slot (object storage for RenderFrameIR)
  slotMeta.push({
    slot: renderFrameSlot,
    storage: 'object',
    offset: storageOffsets.object++,
    stride: 1, // Object slots store a single reference
    type: canonicalType(FLOAT), // Type is irrelevant for RenderFrameIR object slot
  });

  // Create OutputSpecIR for render frame
  const outputs: OutputSpecIR[] = [{
    kind: 'renderFrame',
    slot: renderFrameSlot,
  }];

  // Build debug index
  const stepToBlock = new Map();
  const slotToBlock = new Map();
  const ports: any[] = [];
  const slotToPort = new Map();
  const blockMap = new Map(); // Map numeric BlockId -> string ID
  const blockDisplayNames = new Map(); // Map numeric BlockId -> user-facing name

  // Populate debug index from unlinkedIR.blockOutputs (provenance)
  if (unlinkedIR.blockOutputs) {
    let portCounter = 0;

    // Build block map from acyclicPatch
    // We need to look up blocks by index to get their string ID
    const blocks = acyclicPatch.blocks || []; // AcyclicOrLegalGraph has blocks array
    for (let i = 0; i < blocks.length; i++) {
      blockMap.set(i, blocks[i].id);
      blockDisplayNames.set(i, blocks[i].displayName || blocks[i].type);
    }

    for (const [blockIndex, outputs] of unlinkedIR.blockOutputs.entries()) {
      for (const [portId, ref] of outputs.entries()) {
        // Only map slot-backed outputs (signals/fields) to debug index.
        // Events (discrete temporality) don't have debug slot support yet.
        const valueId = ref.id as unknown as ValueExprId;
        const expr = valueExprNodes[valueId as unknown as number];
        if (!expr) continue;

        const tempAxis = expr.type.extent.temporality;
        if (tempAxis.kind === 'inst' && tempAxis.value.kind === 'discrete') {
          continue;
        }

        const domain = inferFieldInstanceFromValueExprs(valueId, valueExprNodes) ? 'field' : 'signal';
        const slot = ref.slot;

        // Generate stable port ID
        const portIndex = portCounter++;

        // Record slot->port mapping
        slotToPort.set(slot, portIndex);

        // Add port binding info
        ports.push({
          port: portIndex,
          block: blockIndex,
          portName: portId,
          direction: 'out',
          domain,
          role: 'userWire',
        });
      }
    }
  }

  // Populate stepToBlock and stepToPort from schedule steps + exprToBlock provenance
  const exprToBlock = builder.getExprToBlock();
  const stepToPortMap = new Map();
  const scheduleSteps = scheduleIR.steps as readonly Step[];
  for (let i = 0; i < scheduleSteps.length; i++) {
    const step = scheduleSteps[i];
    const exprId = getStepExprId(step);
    if (exprId !== null) {
      const blockIdx = exprToBlock.get(exprId);
      if (blockIdx !== undefined) {
        stepToBlock.set(i, blockIdx);
      }
      // Resolve step → port via slotToPort (for steps that write to a slot)
      const targetSlot = getStepTargetSlot(step);
      if (targetSlot !== null) {
        const portIdx = slotToPort.get(targetSlot);
        if (portIdx !== undefined) {
          stepToPortMap.set(i, portIdx);
        }
      }
    }
  }

  // Build expression provenance map
  // Maps each ValueExprId to its source block + resolved user-facing target for derived blocks
  const exprProvenance = new Map<ValueExprId, ExprProvenanceIR>();

  if (exprToBlock.size > 0) {
    // Reverse lookup: string block ID → block object (for role access)
    const patchBlocks = acyclicPatch.blocks || [];
    const stringIdToBlock = new Map<string, typeof patchBlocks[number]>();
    for (const block of patchBlocks) {
      stringIdToBlock.set(block.id, block);
    }

    // Reverse lookup: string block ID → numeric index (for blockMap-compatible IDs)
    const stringIdToIndex = new Map<string, number>();
    for (const [idx, strId] of blockMap.entries()) {
      stringIdToIndex.set(strId, idx as number);
    }

    // Map ValueExprId → portName via blockOutputs
    const exprIdToPortName = new Map<number, string>();
    if (unlinkedIR.blockOutputs) {
      for (const [, outputsByPort] of unlinkedIR.blockOutputs.entries()) {
        for (const [portName, ref] of outputsByPort.entries()) {
          exprIdToPortName.set(ref.id as unknown as number, portName);
        }
      }
    }

    for (const [exprId, blockStringId] of exprToBlock) {
      const blockStr = blockStringId as unknown as string;
      const block = stringIdToBlock.get(blockStr);
      if (!block) continue;

      const portName = exprIdToPortName.get(exprId as unknown as number) ?? null;
      let userTarget: ExprUserTarget | null = null;

      if (block.role.kind === 'derived') {
        const meta = block.role.meta;
        switch (meta.kind) {
          case 'defaultSource': {
            const targetStr = meta.target.port.blockId as string;
            const targetIdx = stringIdToIndex.get(targetStr);
            if (targetIdx !== undefined) {
              userTarget = {
                kind: 'defaultSource',
                targetBlockId: targetStr as BlockId,
                targetPortName: meta.target.port.portId as string,
              };
            }
            break;
          }
          case 'adapter':
            userTarget = {
              kind: 'adapter',
              edgeId: meta.edgeId,
              adapterType: meta.adapterType,
            };
            break;
          case 'wireState':
            userTarget = {
              kind: 'wireState',
              wireId: meta.target.wire as string,
            };
            break;
          case 'lens':
            userTarget = {
              kind: 'lens',
              nodeRef: JSON.stringify(meta.target.node),
            };
            break;
          case 'compositeExpansion':
            userTarget = {
              kind: 'compositeExpansion',
              compositeId: meta.compositeDefId,
              internalBlockId: meta.internalBlockId,
            };
            break;
        }
      }

      exprProvenance.set(exprId, {
        blockId: blockStringId,
        portName,
        userTarget,
      });
    }
  }

  const debugIndex = {
    stepToBlock,
    slotToBlock,
    exprToBlock,
    ports,
    slotToPort,
    blockMap,
    blockDisplayNames,
    stepToPort: stepToPortMap,
    exprProvenance,
  };

  // Collect render globals from builder
  const renderGlobals = builder.getRenderGlobals();

  // Validate camera uniqueness (spec §2.1)
  if (renderGlobals.length > 1) {
    throw new Error('E_CAMERA_MULTIPLE: Only one Camera block is permitted.');
  }

  // Build the program (ValueExpr-only, with kernel registry)
  const program: CompiledProgramIR = {
    irVersion: 1,
    valueExprs: { nodes: valueExprNodes },
    constants: { json: [] },
    schedule: scheduleIR,
    outputs,
    slotMeta,
    debugIndex,
    fieldSlotRegistry,
    renderGlobals, // NEW - Camera system: populated from builder
    kernelRegistry: registry, // Phase B: Kernel registry with resolved handles
  };

  return program;
}


/**
 * Extract the primary expression ID from a schedule step.
 * Returns null for infrastructure steps that don't reference a value expression.
 */
function getStepExprId(step: Step): ValueExprId | null {
  switch (step.kind) {
    case 'evalValue':
      return step.expr;
    case 'slotWriteStrided':
      return step.inputs.length > 0 ? step.inputs[0] : null;
    case 'materialize':
      return step.field;
    case 'stateWrite':
    case 'fieldStateWrite':
      return step.value;
    case 'render':
      return step.scale?.id ?? null;
    case 'continuityMapBuild':
    case 'continuityApply':
      return null;
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

/**
 * Extract the target slot from a step (for step-to-port resolution).
 * Returns null if the step doesn't write to a tracked value slot.
 */
function getStepTargetSlot(step: Step): ValueSlot | null {
  switch (step.kind) {
    case 'evalValue':
      return step.target.storage === 'value' ? step.target.slot : null;
    case 'slotWriteStrided':
      return step.slotBase;
    case 'materialize':
      return step.target;
    case 'render':
    case 'stateWrite':
    case 'fieldStateWrite':
    case 'continuityMapBuild':
    case 'continuityApply':
      return null;
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

/**
 * Infer instance from a field ValueExpr.
 * Used to build fieldSlotRegistry for demand-driven materialization.
 */
function inferFieldInstanceFromValueExprs(
  fieldId: ValueExprId,
  valueExprs: readonly ValueExpr[]
): any {
  const expr = valueExprs[fieldId as unknown as number];
  if (!expr) return undefined;

  // Only field-extent expressions have a meaningful instance.
  // In the compiler pipeline, CanonicalType axes must be instantiated.
  const cardAxis = expr.type.extent.cardinality;
  if (cardAxis.kind !== 'inst') {
    throw new Error(
      `E_UNINSTANTIATED_CARDINALITY: expected instantiated cardinality for field ValueExprId=${Number(fieldId)}`
    );
  }
  if (cardAxis.value.kind !== 'many') return undefined;

  // Canonical: derive instance via CanonicalType helper (also enforces invariants)
  return requireManyInstance(expr.type).instanceId;
}
