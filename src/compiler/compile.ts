/**
 * Compiler Entry Point
 *
 * Main compilation pipeline:
 * 1. Normalization - Convert Patch to NormalizedPatch
 * 2. Pass 2: Type Graph - Resolve types for all connections
 * 3. Pass 3: Dependency Graph - Build execution dependencies
 * 4. Pass 4: Cycle Validation (SCC) - Check for illegal cycles
 * 5. Pass 5: Block Lowering - Lower blocks to IR expressions
 * 6. Pass 6: Schedule Construction - Build execution schedule
 * 7. Kernel Resolution - Resolve kernel names to handles (Phase B)
 *
 * Integrated with event emission for diagnostics.
 */

import type { Patch } from '../graph';
import type {
  CompiledProgramIR,
  SlotMetaEntry,
  RuntimeSlotEntry,
  RuntimeAddressTableIR,
  RuntimeSlotLookupEntry,
  FieldSlotEntry,
  OutputSpecIR,
  DrawPrepProgramIR,
  DrawPrepSinkIR,
  ExprProvenanceIR,
  GeneratedComputeProgramIR,
  PortBindingIR,
  MemoryResourceIR,
  MemoryManifestIR,
} from './ir/program';
import type { InstanceId, StepIndex, ValueSlot } from './ir/Indices';
import { SCALAR_INSTANCE_ID, stepIndex } from './ir/Indices';
import { blockIndex, type BlockIndex } from './ir/BlockIndex';
import type { UnlinkedIRFragments } from './backend/lower-blocks';
import type { ScheduleIR } from './backend/schedule-program';
import type { AcyclicOrLegalGraph } from './ir/patches';
import type { EventHub } from '../events/EventHub';
import { payloadStride, requireInst, requireManyInstance, isMany } from '../core/canonical-types';
import type { CanonicalType } from '../core/canonical-types';
import {
  deriveStorageLayout,
  deriveArenaZonePlan,
  DEFAULT_ARENA_ALIGNMENT_POLICY,
  resolveInstanceCount,
} from './ir/storage-class';
import type { ArenaSlotDescriptor } from '../runtime/ArenaValueStore';
import type { ValueExpr, ValueExprId } from './ir/value-expr';
import type { Step } from './ir/types';
import type { SerializableTopologyDef } from '../shapes/types';
import { ShapeClass } from '../shapes/types';
import { lowerScheduleToNagaModule, type NagaLoweringCoverageIR } from './ir/naga-emitter';
import { compilationInspector } from '../services/CompilationInspectorService';
import { computeRenderReachableBlocks } from './reachability';
import { resolveKernels } from './resolve-kernels';
import { createDefaultRegistry } from '../runtime/kernels/default-registry';
import { getValueExprChildren } from '../runtime/ValueExprTreeWalker';
import { compileFrontend, type FrontendResult, type FrontendError } from './frontend';
import { compileError, type CompileError } from './types';
import { buildProgramTopologyTable, collectAllProgramTopologyIds } from './ir/program-topology';
import { intersectUpdateClass } from '../types/compiler';

import { registerAllBlocks } from '../blocks/all';

// Import passes
import { pass4DepGraph } from './backend/derive-dep-graph';
import { pass5CycleValidation } from './backend/schedule-scc';
import { pass6BlockLowering } from './backend/lower-blocks';
import { pass7Schedule } from './backend/schedule-program';
import { allocateRenderMaterializationPipeline } from './backend/render-materialization-pipeline';

registerAllBlocks();

// =============================================================================
// Compile Errors & Results
// =============================================================================

export type { CompileError } from './types';

export type CompileSuccess = {
  readonly kind: 'ok';
  readonly program: CompiledProgramIR;
  readonly warnings: readonly CompileError[];
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
  readonly events?: EventHub;
  readonly allowMissingTimeRoot?: boolean;
  readonly captureInspector?: boolean;
}

export type CompileFromFrontendOptions = CompileOptions;

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
  // [LAW:single-enforcer] Raw Patch enters backend pipeline only through this boundary.
  const frontend = compileFrontend(patch);
  return compileFromFrontend(frontend, options);
}

/**
 * Compile using precomputed frontend output.
 *
 * Used by worker/orchestrator paths to avoid rerunning frontend while keeping
 * the backend contract independent from raw Patch plumbing.
 */
export function compileFromFrontend(
  frontend: FrontendResult,
  options?: CompileFromFrontendOptions,
): CompileResult {
  const compileId = options?.patchId ? `${options.patchId}:${options.patchRevision || 0}` : 'unknown';
  const captureInspector = options?.captureInspector !== false;

  // [LAW:one-source-of-truth] compile() owns the inspector snapshot lifecycle unconditionally.
  // [LAW:single-enforcer] Inspector is internally resilient — no try/catch needed.
  if (captureInspector) {
    compilationInspector.beginCompile(compileId);
  }

  try {
    if (!frontend.backendReady) {
      return makeFailure(frontend.errors.map(frontendErrorToCompileError), captureInspector);
    }

    const normalized = frontend.normalizedPatch;
    const typedPatch = frontend.typedPatch;
    const graph = normalized.graph;

    // Capture frontend passes (for inspection)
    if (captureInspector) {
      compilationInspector.capturePass('normalization', graph, normalized);
      compilationInspector.capturePass('type-constraints', normalized, typedPatch);
      compilationInspector.capturePass('type-graph', normalized, typedPatch);
      compilationInspector.capturePass('axis-validation', typedPatch, {
        errors: frontend.errors,
      });
      compilationInspector.capturePass('cycle-analysis', typedPatch,
        frontend.cycleSummary,
      );
    }

    // =========================================================================
    // Backend: Always runs (requires frontend output)
    // =========================================================================

    // Pass 3: Dependency Graph
    const depGraphPatch = pass4DepGraph(typedPatch);

    if (captureInspector) {
      compilationInspector.capturePass('depgraph', typedPatch, depGraphPatch);
    }

    // Pass 4: Cycle Validation (SCC)
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    if (captureInspector) {
      compilationInspector.capturePass('scc', depGraphPatch, acyclicPatch);
    }

    // Pass 6: Block Lowering
    const unlinkedIR = pass6BlockLowering(acyclicPatch, {
      events: options?.events,
      compileId,
      patchRevision: options?.patchRevision,
      allowMissingTimeRoot: options?.allowMissingTimeRoot,
    });

    if (captureInspector) {
      compilationInspector.capturePass('block-lowering', acyclicPatch, unlinkedIR);
    }

    // Check for errors from pass 6 - Filter by reachability
    // Collect warnings for unreachable blocks to surface on result
    // Start with frontend-detected unreachable blocks
    let unreachableBlockWarnings: CompileError[] = frontend.unreachableBlockIds.map((blockId) => ({
      code: 'W_BLOCK_UNREACHABLE_ERROR',
      message: `Block '${blockId}' is not connected to render pipeline`,
      where: { blockId },
    }));

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
      const reachableErrors: CompileError[] = [];
      const unreachableErrors: CompileError[] = [];

      for (const error of unlinkedIR.errors) {
        // [LAW:single-enforcer] Compiler invariants must fail compilation regardless of graph reachability.
        if (isAlwaysFatalInvariantError(error)) {
          reachableErrors.push(error);
          continue;
        }
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

      // Build warnings for unreachable block errors
      unreachableBlockWarnings = unreachableErrors.map((error) => ({
        code: 'W_BLOCK_UNREACHABLE_ERROR',
        message: `Block '${error.where?.blockId || 'unknown'}' has error but is not connected to render pipeline: ${error.message}\n\nSuggestion: Connect this block to the render pipeline or remove it.`,
        where: { blockId: error.where?.blockId },
      }));

      // Only fail compilation if there are reachable errors
      if (reachableErrors.length > 0) {
        return makeFailure(reachableErrors, captureInspector);
      }
    }


    // Pass 6b: Render Materialization Pipeline
    const renderPipeline = allocateRenderMaterializationPipeline(unlinkedIR, acyclicPatch);

    // Pass 7: Schedule Construction (pure ordering, no allocation)
    const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch, renderPipeline);

    if (captureInspector) {
      compilationInspector.capturePass('schedule', unlinkedIR, scheduleIR);
    }

    // Phase B: Kernel Resolution
    // Create default registry and resolve all kernel references to handles
    const registry = createDefaultRegistry();
    // Cast to mutable: we need to mutate PureFn nodes to add handles
    const valueExprs = unlinkedIR.builder.getValueExprs() as ValueExpr[];
    const kernelResolutionErrors = resolveKernels(valueExprs, registry);

    if (kernelResolutionErrors.length > 0) {
      return makeFailure(kernelResolutionErrors.map((e) => ({
        code: e.kind,
        message: e.message,
      })), captureInspector);
    }

    // Convert to CompiledProgramIR (now with registry)
    const compiledIR = convertLinkedIRToProgram(unlinkedIR, scheduleIR, acyclicPatch, registry);
    const nagaLoweringDiagnostics = collectNagaLoweringCoverageDiagnostics(
      compiledIR.nagaLoweringProgram.coverage,
    );
    if (nagaLoweringDiagnostics.errors.length > 0) {
      return makeFailure([...nagaLoweringDiagnostics.errors], captureInspector);
    }

    if (captureInspector) {
      compilationInspector.endCompile('success');
    }
    return {
      kind: 'ok',
      program: compiledIR,
      warnings: [
        ...unreachableBlockWarnings,
        ...unlinkedIR.warnings,
        ...nagaLoweringDiagnostics.warnings,
      ],
    };
  } catch (e: unknown) {
    if (isCompileErrorLike(e)) {
      return makeFailure([e], captureInspector);
    }
    const error = e instanceof Error ? e : new Error(String(e));
    const errorCode = (e as { code?: string }).code || 'CompilationFailed';
    return makeFailure([{ code: errorCode, message: error.message || 'Unknown compilation error' }], captureInspector);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Convert FrontendError (kind-based) to CompileError (code-based). */
function frontendErrorToCompileError(e: FrontendError): CompileError {
  return {
    code: e.kind,
    message: e.message,
    where: { blockId: e.blockId, port: e.portId },
    sourceSpan: e.sourceSpan,
  };
}

function isCompileErrorLike(value: unknown): value is CompileError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

// [LAW:single-enforcer] Events are emitted by CompileOrchestrator, not compile().
function makeFailure(errors: CompileError[], captureInspector: boolean): CompileFailure {
  if (captureInspector) {
    compilationInspector.endCompile('failure');
  }
  return { kind: 'error', errors };
}

// [LAW:single-enforcer] Compile boundary is the sole authority that decides
// whether lowering coverage metadata becomes a hard compile failure.
export function collectNagaLoweringCoverageDiagnostics(
  coverage: NagaLoweringCoverageIR | undefined,
): { readonly errors: readonly CompileError[]; readonly warnings: readonly CompileError[] } {
  if (!coverage || coverage.droppedComputeStepCount === 0) {
    return { errors: [], warnings: [] };
  }

  const topReason = coverage.hardDrops[0];
  const locationHint = topReason
    ? ` (first failure: step ${topReason.stepIndex}, reason: ${topReason.reason})`
    : '';

  return {
    errors: [{
      code: 'IRValidationFailed',
      message: `Naga lowering failed: ${coverage.droppedComputeStepCount} unresolved compute-owned step(s) remain after lowering.${locationHint}`,
      details: {
        totalStepCount: coverage.totalStepCount,
        boundaryStepCount: coverage.boundaryStepCount,
        droppedComputeStepCount: coverage.droppedComputeStepCount,
        hardDropReasonCounts: coverage.hardDropReasonCounts,
        hardDrops: coverage.hardDrops,
      },
    }],
    warnings: [],
  };
}

/**
 * Compiler invariants are non-negotiable backend correctness checks and must
 * not be downgraded to unreachable warnings.
 */
function isAlwaysFatalInvariantError(error: CompileError): boolean {
  return error.details?.compilerInvariant === 'unresolvedPlaceholderInstance';
}

function compileErrorFromUnexpected(args: {
  readonly code: string;
  readonly error: unknown;
  readonly blockId?: string;
  readonly portId?: string;
}): CompileError {
  const message = args.error instanceof Error ? args.error.message : String(args.error);
  return compileError(args.code, message, {
    blockId: args.blockId,
    port: args.portId,
  });
}

function readRequiredBlockLabel(
  blockMap: ReadonlyMap<BlockIndex, string>,
  blockId: BlockIndex,
): string {
  const blockLabel = blockMap.get(blockId);
  if (!blockLabel) {
    throw new Error(`Missing debug block label for block index ${blockId}`);
  }
  return blockLabel;
}

function assertCanonicalRuntimeStorage(storage: SlotMetaEntry['storage']): RuntimeSlotEntry['storage'] {
  if (storage === 'f32' || storage === 'i32' || storage === 'u32') {
    return storage;
  }
  // [LAW:single-enforcer] Compiler slot derivation is the single boundary that
  // enforces canonical runtime ABI storage vocabulary.
  throw new Error('Non-canonical runtime storage emitted by deriveStorageLayout: ' + storage);
}

function buildRuntimeAddressTable(
  runtimeSlots: readonly RuntimeSlotEntry[],
  scheduleIR: ScheduleIR,
  precomputedFieldSlots?: ReadonlyMap<number, ValueSlot>,
): RuntimeAddressTableIR {
  const slotLookup = new Map<ValueSlot, RuntimeSlotLookupEntry>();
  const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>();
  for (const slotEntry of runtimeSlots) {
    slotLookup.set(slotEntry.slot, {
      storage: slotEntry.storage,
      offset: slotEntry.offset,
      stride: slotEntry.stride,
      slot: slotEntry.slot,
      type: slotEntry.type,
      arena: slotEntry.arena,
    });
    // [LAW:one-source-of-truth] Every slot with an arena descriptor is registered.
    // Physical offsets are resolved by Rust MMU; TS-side uses symbolic resourceId.
    slotToArena.set(slotEntry.slot, slotEntry.arena);
  }

  // [LAW:one-source-of-truth] Field slot ownership comes from IR builder
  // registration; schedule materialize steps augment this map for runtime reads.
  const initialFieldSlots =
    precomputedFieldSlots === undefined ? [] : precomputedFieldSlots;
  const fieldExprToSlot = new Map<number, ValueSlot>(initialFieldSlots);
  const scalarExprToArenaAddress = new Map<number, { slot: ValueSlot; arena: ArenaSlotDescriptor; component: number }>();
  const steps = scheduleIR.steps as readonly Step[];
  for (const step of steps) {
    if (step.kind === 'materialize') {
      fieldExprToSlot.set(step.field as number, step.target);
      if (step.instanceId === SCALAR_INSTANCE_ID) {
        // [LAW:single-enforcer] Scalar arena addressability is established only
        // from canonical scalar materialize steps at compile boundary.
        const arenaDesc = slotToArena.get(step.target);
        if (arenaDesc) {
          scalarExprToArenaAddress.set(step.field as number, {
            slot: step.target,
            arena: arenaDesc,
            component: 0,
          });
        }
      }
    }
  }

  return {
    slotLookup,
    fieldExprToSlot,
    scalarExprToArenaAddress,
    slotToArena,
  };
}

function assertRuntimeAddressTableCoverage(
  runtimeSlots: readonly RuntimeSlotEntry[],
  runtimeAddressTable: RuntimeAddressTableIR,
): void {
  // [LAW:one-source-of-truth] Runtime address table coverage is validated once
  // at compile-time so runtime execution never derives/repairs addressing.
  if (runtimeAddressTable.slotLookup.size !== runtimeSlots.length) {
    throw new Error(
      'runtimeAddressTable.slotLookup coverage mismatch: expected ' +
        runtimeSlots.length +
        ', got ' +
        runtimeAddressTable.slotLookup.size,
    );
  }
  for (const slotEntry of runtimeSlots) {
    const lookup = runtimeAddressTable.slotLookup.get(slotEntry.slot);
    if (!lookup) {
      throw new Error('runtimeAddressTable missing slot lookup for slot ' + slotEntry.slot);
    }
    if (lookup.storage !== slotEntry.storage || lookup.offset !== slotEntry.offset || lookup.stride !== slotEntry.stride) {
      throw new Error('runtimeAddressTable slot mismatch for slot ' + slotEntry.slot);
    }
  }
}

function assertExtractAddressability(
  valueExprs: readonly ValueExpr[],
  runtimeAddressTable: RuntimeAddressTableIR,
): void {
  for (let exprId = 0; exprId < valueExprs.length; exprId++) {
    const expr = valueExprs[exprId];
    if (!expr || expr.kind !== 'extract') continue;
    const extractCardinality = requireInst(expr.type.extent.cardinality, 'cardinality').kind;
    if (extractCardinality !== 'one') continue;

    const inputId = expr.input as number;
    const inputExpr = valueExprs[inputId];
    if (!inputExpr) {
      throw new Error(`extract expr ${exprId} references missing input ${inputId}`);
    }

    if (runtimeAddressTable.scalarExprToArenaAddress.has(inputId)) continue;
    if (inputExpr.kind === 'construct') continue;

    const inputStride = payloadStride(inputExpr.type.payload);
    if (inputStride === 1 && expr.componentIndex === 0) {
      throw new Error(
        `non-canonical extract expr ${exprId}: scalar extract(0) must be normalized upstream (input ${inputId})`,
      );
    }
    if (inputExpr.kind === 'const') {
      throw new Error(
        `non-canonical extract expr ${exprId}: const extract must be folded upstream (input ${inputId})`,
      );
    }

    // [LAW:single-enforcer] Compiler addressability checks are enforced once at
    // compile boundary so runtime evaluator does not encode policy fallbacks.
    throw new Error(
      `extract expr ${exprId} input ${inputId} (${inputExpr.kind}) has no canonical arena address`,
    );
  }
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
  if (unlinkedIR.blockOutputs) {
    for (const [, outputs] of unlinkedIR.blockOutputs.entries()) {
      for (const [, ref] of outputs.entries()) {
        const valueId = ref.id;
        const instanceId = inferFieldInstanceFromValueExprs(valueId, valueExprNodes);
        if (instanceId) {
          fieldSlotRegistry.set(ref.slot!, { fieldId: valueId, instanceId });
        }
      }
    }
  }

  // Build slot metadata from slot types.
  // [LAW:one-source-of-truth] Runtime ABI storage is emitted as canonical vocabulary.
  // No legacy label normalization is allowed in runtime contract emission.
  const slotTypes = builder.getSlotLayoutInputs();
  const slotMeta: SlotMetaEntry[] = [];
  const runtimeSlotEntries: Array<Omit<RuntimeSlotEntry, 'arena'>> = [];
  const instances = builder.getInstances();
  const arenaSlotPlanInputs: Array<{
    readonly slot: ValueSlot;
    readonly type: RuntimeSlotEntry['type'];
    readonly overrideStride?: number;
    readonly packingPreference: 'soa';
  }> = [];

  const storageOffsets: Record<RuntimeSlotEntry['storage'], number> = {
    f32: 0,
    i32: 0,
    u32: 0,
  };

  const slotCount = builder.getSlotCount();

  for (let slotId = 0; slotId < slotCount; slotId++) {
    const slot = slotId as ValueSlot;
    const slotInfo = slotTypes.get(slot);
    if (!slotInfo?.type) throw new Error(`Slot ${slot} has no registered type — IR builder bug`);
    const type = slotInfo.type;
    // [LAW:one-source-of-truth] Single derivation point for storage class + stride.
    let derivedStorage: ReturnType<typeof deriveStorageLayout>['storage'];
    let stride: number;
    try {
      ({ storage: derivedStorage, stride } = deriveStorageLayout(type, slotInfo.stride));
    } catch (error) {
      throw compileErrorFromUnexpected({
        code: 'AxisInvalid',
        error,
        blockId: slotInfo.source?.blockId,
        portId: slotInfo.source?.portId,
      });
    }
    const storage = assertCanonicalRuntimeStorage(derivedStorage);

    const offset = storageOffsets[storage];
    storageOffsets[storage] += stride;

    slotMeta.push({ slot, storage, offset, stride, type });

    // Arena descriptor inputs: canonical zone plan decides final offset.
    // [LAW:one-source-of-truth] P0-1 SoA mandate: compiler slot planning emits
    // canonical SoA descriptors for all runtime slots.
    arenaSlotPlanInputs.push({
      slot,
      type,
      overrideStride: slotInfo.stride,
      packingPreference: 'soa',
    });
    runtimeSlotEntries.push({
      slot,
      storage,
      offset,
      stride,
      type,
    });
  }

  // Build Memory Manifest (Symbolic intent for Phase 1 MMU)
  // [LAW:one-source-of-truth] This manifest is the sole authority for GPU
  // memory requirements; Rust MMU performs physical allocation.
  const manifestResources: MemoryResourceIR[] = [];
  const materializeTargetSlots = collectMaterializeTargetSlots(scheduleIR);

  // 1. Scalar/Field Arena Slots
  for (const slotInput of arenaSlotPlanInputs) {
    const card = requireInst(slotInput.type.extent.cardinality, 'cardinality');
    const cardinality = isMany(card)
      ? resolveInstanceCount(card.instance.instanceId, instances)
      : 1;

    // [LAW:one-source-of-truth] Read updateClass and source from builder slot metadata.
    // Every arena slot was allocated through allocTypedSlot, so metadata must exist.
    const slotMd = slotTypes.get(slotInput.slot);
    if (!slotMd) {
      throw new Error(`Slot ${slotInput.slot} missing from slotLayoutInputs — allocTypedSlot was not called for this slot.`);
    }
    // [LAW:single-enforcer] Writable arena-slot classification is enforced once
    // at manifest emission: materialize targets cannot remain FrameTime-only UBO.
    const writeCompatibilityClass = materializeTargetSlots.has(slotInput.slot)
      ? 'CompileTime'
      : 'FrameTime';
    const effectiveUpdateClass = intersectUpdateClass(slotMd.updateClass, writeCompatibilityClass);
    manifestResources.push({
      id: `arena:slot:${slotInput.slot}`,
      type: slotInput.type,
      cardinality,
      packing: slotInput.packingPreference,
      updateClass: effectiveUpdateClass,
      source: slotMd.source,
      label: `Slot ${slotInput.slot}`,
    });
  }

  // 2. Persistent State Bank
  if (scheduleIR.stateSlotCount > 0) {
    // [LAW:one-source-of-truth] State bank cardinality is governed by the schedule.
    // We declare ONE resource for the bank; Rust MMU handles double-buffering.
    manifestResources.push({
      id: 'state:bank',
      type: { payload: { kind: 'float' }, extent: { cardinality: { kind: 'one' }, temporality: { kind: 'discrete' } } } as unknown as CanonicalType,
      cardinality: scheduleIR.stateSlotCount,
      packing: 'soa',
      updateClass: 'FrameTime',
      label: 'Persistent State Bank',
    });
  }

  // 3. Additional resources declared by blocks (e.g., Texture2D for fluid sims)
  manifestResources.push(...unlinkedIR.additionalMemoryResources);

  const memoryManifest: MemoryManifestIR = { resources: manifestResources };

  // Update runtimeSlots with symbolic arena descriptors (offsets/strides are now symbolic)
  const runtimeSlots: RuntimeSlotEntry[] = runtimeSlotEntries.map((entry) => {
    const card = requireInst(entry.type.extent.cardinality, 'cardinality');
    const laneCount = isMany(card)
      ? resolveInstanceCount(card.instance.instanceId, instances)
      : 1;

    return {
      ...entry,
      arena: {
        resourceId: `arena:slot:${entry.slot}`,
        // These fields are legacy and will be removed in hardening pass.
        // We set them to dummy values to satisfy the existing type.
        offset: 0,
        stride: 1, // dummy
        laneCount,
        length: 0,
        packing: 'soa',
        laneStride: 0,
        componentStride: 0,
      } as any,
    };
  });

  // Build output specs from canonical output contract only.
  const outputs: OutputSpecIR[] = [{ kind: 'renderFrame' }];
  const topologyIds = collectAllProgramTopologyIds({
    valueExprs: { nodes: valueExprNodes },
    steps: scheduleIR.steps as readonly Step[],
  });
  const ownedTopologies = builder.getSerializableTopologies();
  const ownedById = new Map(ownedTopologies.map((definition) => [definition.id, definition]));
  const topologyDefinitions = topologyIds.map((id) => {
    const owned = ownedById.get(id);
    if (owned) {
      return owned;
    }
    // [LAW:one-source-of-truth] Compiled programs must carry topology
    // definitions from compile-owned builder registration only.
    throw new Error(`Compiled program is missing owned topology definition ${id}`);
  });
  const topologyTable = buildProgramTopologyTable(topologyDefinitions);

  const drawPrepProgram = buildDrawPrepProgram(scheduleIR, valueExprNodes, ownedById);
  const runtimeAddressTable = buildRuntimeAddressTable(
    runtimeSlots,
    scheduleIR,
    builder.getFieldSlots(),
  );
  assertRuntimeAddressTableCoverage(runtimeSlots, runtimeAddressTable);
  assertExtractAddressability(valueExprNodes, runtimeAddressTable);
  const generatedComputeProgram = buildGeneratedComputeProgram(
    scheduleIR,
    runtimeAddressTable,
  );
  const nagaLoweringProgramBase = lowerScheduleToNagaModule({
    schedule: scheduleIR,
    runtimeAddressTable,
    valueExprs: valueExprNodes,
    exprToBlock: builder.getExprToBlock(),
  });
  // Attach block-emitted dispatch instructions (e.g., fluid sim kernels)
  const nagaLoweringProgram = unlinkedIR.dispatchInstructions.length > 0
    ? { ...nagaLoweringProgramBase, dispatchInstructions: unlinkedIR.dispatchInstructions }
    : nagaLoweringProgramBase;

  // Build debug index
  type DebugPortBinding = CompiledProgramIR['debugIndex']['ports'][number];
  const stepToBlock = new Map<StepIndex, BlockIndex>();
  const slotToBlock = new Map<ValueSlot, BlockIndex>();
  const ports: DebugPortBinding[] = [];
  const slotToPort = new Map<ValueSlot, DebugPortBinding['port']>();
  const blockMap = new Map<BlockIndex, string>(); // Map numeric BlockId -> string ID
  const blockDisplayNames = new Map<BlockIndex, string>(); // Map numeric BlockId -> user-facing name
  // [LAW:one-source-of-truth] Numeric debug block references are derived only from
  // compile-owned block ordering; downstream consumers must not invent alternate keys.
  const blockIdToIndex = new Map<string, BlockIndex>();
  const toDebugPortId = (index: number): DebugPortBinding['port'] => index as DebugPortBinding['port'];

  // Populate debug index from unlinkedIR.blockOutputs (provenance)
  if (unlinkedIR.blockOutputs) {
    let portCounter = 0;

    // Build block map from acyclicPatch
    const blocks = acyclicPatch.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const numericBlockId = blockIndex(i);
      blockMap.set(numericBlockId, blocks[i].id);
      blockDisplayNames.set(numericBlockId, blocks[i].id || blocks[i].type);
      blockIdToIndex.set(blocks[i].id, numericBlockId);
    }

    for (const [numericBlockIndex, outputs] of unlinkedIR.blockOutputs.entries()) {
      const debugBlockId = blockIndex(numericBlockIndex);
      const debugBlockLabel = readRequiredBlockLabel(blockMap, debugBlockId);
      for (const [portId, ref] of outputs.entries()) {
        const valueId = ref.id;
        const expr = valueExprNodes[valueId];
        if (!expr) continue;
        let card: 'zero' | 'one' | 'many';
        let temp: 'continuous' | 'discrete';
        try {
          card = requireInst(expr.type.extent.cardinality, 'cardinality').kind;
          temp = requireInst(expr.type.extent.temporality, 'temporality').kind;
        } catch (error) {
          throw compileErrorFromUnexpected({
            code: 'AxisInvalid',
            error,
            blockId: debugBlockLabel,
            portId,
          });
        }
        const slot = ref.slot;

        // Generate stable port ID
        const portIndex = toDebugPortId(portCounter++);

        // [LAW:one-source-of-truth] Slot mapping is only for slot-backed outputs.
        // Discrete outputs are represented in ports metadata but do not require slot aliases.
        if (slot !== undefined) {
          // [LAW:one-source-of-truth] Slot-backed debug provenance is authored
          // once at compile time, then consumed read-only by runtime inspectors.
          slotToBlock.set(slot, debugBlockId);
          slotToPort.set(slot, portIndex);
        }

        // Add port binding info
        ports.push({
          port: portIndex,
          block: debugBlockId,
          portName: portId,
          direction: 'out',
          cardinality: card,
          temporality: temp,
          role: 'userWire',
        });
      }
    }
  }

  // Populate stepToBlock and stepToPort from schedule steps + exprToBlock provenance
  const exprToBlock = builder.getExprToBlock();
  const stepToPortMap = new Map<StepIndex, DebugPortBinding['port']>();
  const scheduleSteps = scheduleIR.steps as readonly Step[];
  for (let i = 0; i < scheduleSteps.length; i++) {
    const step = scheduleSteps[i];
    const stepId = stepIndex(i);
    const exprId = getStepExprId(step);
    if (exprId !== null) {
      const blockId = exprToBlock.get(exprId);
      if (blockId !== undefined) {
        const numericBlockId = blockIdToIndex.get(blockId);
        if (numericBlockId === undefined) {
          throw new Error(
            `compile(): Missing blockIdToIndex entry for blockId "${blockId}" (exprId=${exprId}, stepIndex=${i}). `
            + 'This indicates exprToBlock provenance is out of sync with compile-owned block ordering.',
          );
        }
        stepToBlock.set(stepId, numericBlockId);
      }
      // Resolve step → port via slotToPort (for steps that write to a slot)
      const targetSlot = getStepTargetSlot(step);
      if (targetSlot !== null) {
        const portIdx = slotToPort.get(targetSlot);
        if (portIdx !== undefined) {
          stepToPortMap.set(stepId, portIdx);
        }
      }
    }
  }

  // Build expression provenance map
  // Maps each ValueExprId to its source block + output port.
  const exprProvenance = new Map<ValueExprId, ExprProvenanceIR>();

  if (exprToBlock.size > 0) {
    // Map ValueExprId → portName via blockOutputs
    const exprIdToPortName = new Map<ValueExprId, string>();
    if (unlinkedIR.blockOutputs) {
      for (const [, outputsByPort] of unlinkedIR.blockOutputs.entries()) {
        for (const [portName, ref] of outputsByPort.entries()) {
          exprIdToPortName.set(ref.id, portName);
        }
      }
    }

    for (const [exprId, blockStringId] of exprToBlock) {
      const portNameResult = exprIdToPortName.get(exprId);
      const portName = portNameResult !== undefined ? portNameResult : null;

      exprProvenance.set(exprId, {
        blockId: blockStringId,
        portName,
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

  // Build fast-path offset table for O(1) control parameter updates.
  // [LAW:one-source-of-truth] Derived once from structured IR metadata at compile time.
  const fastPathOffsets: Record<string, number> = {};
  for (const meta of slotMeta) {
    if (meta.storage !== 'f32') continue;
    const slotMd = slotTypes.get(meta.slot);
    if (slotMd?.source) {
      fastPathOffsets[`${slotMd.source.blockId}:${slotMd.source.portId}`] = meta.offset;
    }
  }

  // Build the program (ValueExpr-only, with kernel registry)
  const program: CompiledProgramIR = {
    irVersion: 1,
    valueExprs: { nodes: valueExprNodes },
    constants: { json: [] },
    schedule: scheduleIR,
    outputs,
    memoryManifest,
    slotMeta,
    runtimeSlots,
    runtimeAddressTable,
    debugIndex,
    fieldSlotRegistry,
    renderGlobals,
    kernelRegistry: registry,
    topologyTable,
    drawPrepProgram,
    generatedComputeProgram,
    nagaLoweringProgram,
    fastPathOffsets,
  };

  return program;
}

function collectMaterializeTargetSlots(scheduleIR: ScheduleIR): ReadonlySet<ValueSlot> {
  const targets = new Set<ValueSlot>();
  // [LAW:dataflow-not-control-flow] Slot writeability is derived by walking the
  // canonical schedule in one fixed pass; step kind carries variability as data.
  for (const step of scheduleIR.steps) {
    if (step.kind !== 'materialize') continue;
    targets.add(step.target);
  }
  return targets;
}

interface ShapeClassification {
  readonly drawMode: DrawPrepSinkIR['drawMode'];
  readonly shapeClass: ShapeClass;
}

/**
 * Classify a render step's shape class and draw mode from compile-owned topology evidence.
 *
 * // [LAW:one-type-per-behavior] Shape class reflects real execution differences.
 * // Draw mode is derived from the class's topology characteristics.
 * // Currently all existing shapes are Type 1 Rigid (closed-path indexed topology
 * // in ShapeBank with per-instance transforms in Arena).
 */
function classifyShapeForRenderStep(
  step: Extract<Step, { kind: 'render' }>,
  valueExprNodes: readonly ValueExpr[],
  topologyById: ReadonlyMap<number, SerializableTopologyDef>,
  materializedFieldExprBySlot: ReadonlyMap<number, number>,
): ShapeClassification {
  const shapeExprId = materializedFieldExprBySlot.get(step.shape.slot as number);
  if (shapeExprId === undefined) {
    // [LAW:no-silent-fallbacks] Draw-mode inference must fail fast when shape
    // slot provenance is missing; hard-coded indexed defaults are forbidden.
    throw new Error(
      'DrawPrepProgram: render step shape slot has no materialize source ' +
        `(slot=${String(step.shape.slot)})`,
    );
  }
  const shapeRefExprId = resolveShapeRefExprId(shapeExprId, valueExprNodes);
  const shapeExpr = shapeRefExprId === null ? null : valueExprNodes[shapeRefExprId];
  if (!shapeExpr || shapeExpr.kind !== 'shapeRef') {
    // [LAW:one-source-of-truth] Draw-prep topology ownership is anchored to
    // shapeRef topology IDs; non-shapeRef sources are compile-time violations.
    throw new Error(
      'DrawPrepProgram: draw mode requires shapeRef source expression ' +
        `(exprId=${shapeExprId}, kind=${valueExprNodes[shapeExprId]?.kind})`,
    );
  }
  const topology = topologyById.get(shapeExpr.topologyId as number);
  if (!topology) {
    throw new Error(
      'DrawPrepProgram: missing topology definition for shapeRef ' +
        `(topologyId=${String(shapeExpr.topologyId)})`,
    );
  }

  // [LAW:one-type-per-behavior] Type 2 Parametric shapes carry a parametricTemplate
  // payload on the shapeRef expression. The install contract packs the template
  // into ShapeBank using packParametricShapeBankRecord.
  if (shapeExpr.parametricTemplate) {
    const topo = shapeExpr.parametricTemplate;
    const drawMode: DrawPrepSinkIR['drawMode'] =
      topo.indexCount > 0 ? 'indexed' : 'nonIndexed';
    return { drawMode, shapeClass: ShapeClass.Type2Parametric };
  }

  // [LAW:one-type-per-behavior] The rigid geometry path is Type 1 and uses
  // non-indexed draws with GPU vertex pulling from canonical ShapeBank topology data.
  const drawMode: DrawPrepSinkIR['drawMode'] = 'nonIndexed';

  return { drawMode, shapeClass: ShapeClass.Type1Rigid };
}

function resolveShapeRefExprId(
  rootExprId: number,
  valueExprNodes: readonly ValueExpr[],
): number | null {
  const stack = [rootExprId];
  const visited = new Set<number>();
  let resolved: number | null = null;
  while (stack.length > 0) {
    const exprId = stack.pop()!;
    if (visited.has(exprId)) continue;
    visited.add(exprId);
    const expr = valueExprNodes[exprId];
    if (!expr) continue;
    if (expr.kind === 'shapeRef') {
      if (resolved !== null && resolved !== exprId) {
        throw new Error(
          'DrawPrepProgram: shape slot resolves to multiple shapeRef sources ' +
            `(rootExprId=${rootExprId}, first=${resolved}, second=${exprId})`,
        );
      }
      resolved = exprId;
      continue;
    }
    const children = getValueExprChildren(expr);
    if (children.length === 0) {
      throw new Error(
        'DrawPrepProgram: shape slot resolves to non-shapeRef leaf expression ' +
          `(rootExprId=${rootExprId}, leafExprId=${exprId}, leafKind=${expr.kind})`,
      );
    }
    for (const child of children) {
      stack.push(child as number);
    }
  }
  return resolved;
}

function buildMaterializedFieldExprBySlot(scheduleIR: ScheduleIR): ReadonlyMap<number, number> {
  const bySlot = new Map<number, number>();
  for (const step of scheduleIR.steps as readonly Step[]) {
    if (step.kind !== 'materialize') {
      continue;
    }
    bySlot.set(step.target as number, step.field as number);
  }
  return bySlot;
}

function buildDrawPrepProgram(
  scheduleIR: ScheduleIR,
  valueExprNodes: readonly ValueExpr[],
  topologyById: ReadonlyMap<number, SerializableTopologyDef>,
): DrawPrepProgramIR {
  const sinks: DrawPrepSinkIR[] = [];
  let indexedRecordCount = 0;
  let nonIndexedRecordCount = 0;
  const maxUint32 = 0xFFFF_FFFF;
  const materializedFieldExprBySlot = buildMaterializedFieldExprBySlot(scheduleIR);
  const steps = scheduleIR.steps as readonly Step[];
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    if (step.kind !== 'render') continue;

    const instance = scheduleIR.instances.get(step.instanceId);
    if (!instance) {
      throw new Error(`DrawPrepProgram: render step references missing instance ${String(step.instanceId)}`);
    }
    const staticInstanceCount = typeof instance.count === 'number' ? instance.count : undefined;
    if (
      staticInstanceCount !== undefined
      && (
        !Number.isFinite(staticInstanceCount)
        || !Number.isInteger(staticInstanceCount)
        || !Number.isSafeInteger(staticInstanceCount)
        || staticInstanceCount < 0
        || staticInstanceCount > maxUint32
      )
    ) {
      // [LAW:no-silent-fallbacks] Invalid static instance counts must fail at
      // compiler boundary so runtime dispatch never receives coerced metadata.
      throw new Error(
        `DrawPrepProgram: instance ${String(step.instanceId)} has invalid static count ${String(staticInstanceCount)}; expected uint32`,
      );
    }

    // [LAW:one-source-of-truth] Shape class and draw mode are derived from
    // compile-owned topology metadata, never hard-coded in runtime/draw-prep.
    const { drawMode, shapeClass } = classifyShapeForRenderStep(
      step,
      valueExprNodes,
      topologyById,
      materializedFieldExprBySlot,
    );
    const indirectRecordIndex = drawMode === 'indexed' ? indexedRecordCount : nonIndexedRecordCount;
    if (drawMode === 'indexed') {
      indexedRecordCount += 1;
    } else {
      nonIndexedRecordCount += 1;
    }
    sinks.push({
      sinkIndex: sinks.length,
      renderStepIndex: stepIndex,
      instanceId: step.instanceId,
      indirectRecordIndex,
      instanceCountMode: staticInstanceCount === undefined ? 'dynamic' : 'static',
      staticInstanceCount,
      // [LAW:one-type-per-behavior] Shape class is the primary execution contract.
      shapeClass,
      // [LAW:one-source-of-truth] Draw-prep command ABI metadata is emitted by
      // compiler and consumed by runtime/renderer as one canonical contract.
      drawMode,
      indirectRegion: drawMode === 'indexed' ? 'indexed' : 'nonIndexed',
      indirectStrideBytes: drawMode === 'indexed' ? 20 : 16,
      topologySource: 'shapeHeaderV1',
      firstInstanceSource: 'runtimePacked',
      ...(drawMode === 'indexed'
        ? {
          indexedFirstIndex: 0,
          indexedBaseVertex: 0,
        }
        : {
          nonIndexedFirstVertex: 0,
        }),
    });
  }
  const indexedRegionBaseWords = 0;
  const indexedStrideWords = 5 as const;
  const nonIndexedStrideWords = 4 as const;
  const nonIndexedRegionBaseWords = indexedRecordCount * indexedStrideWords;
  const totalRecordCount = indexedRecordCount + nonIndexedRecordCount;
  // [LAW:no-string-math] P0-0 forbids lowering-time WGSL source emission.
  // Draw-prep lowering exports structured sink metadata only.
  return {
    totalRecordCount,
    indexedRecordCount,
    indexedRegionBaseWords,
    indexedStrideWords,
    nonIndexedRecordCount,
    nonIndexedRegionBaseWords,
    nonIndexedStrideWords,
    sinks,
  };
}

function collectComputeSlots(scheduleIR: ScheduleIR): ValueSlot[] {
  const slots = new Set<ValueSlot>();
  for (const step of scheduleIR.steps) {
    switch (step.kind) {
      case 'materialize':
        slots.add(step.target);
        break;
      case 'render':
        slots.add(step.controlPointsSlot);
        slots.add(step.colorSlot);
        slots.add(step.shape.slot);
        slots.add(step.scale.slot);
        if (step.rotationSlot !== undefined) slots.add(step.rotationSlot);
        if (step.scale2Slot !== undefined) slots.add(step.scale2Slot);
        if (step.controlPoints?.k === 'slot') slots.add(step.controlPoints.slot);
        break;
      case 'eventDispatch':
      case 'stateWrite':
      case 'fieldStateWrite':
        break;
      default: {
        const _exhaustive: never = step;
        void _exhaustive;
      }
    }
  }
  return Array.from(slots.values()).sort((a, b) => a - b);
}

function buildGeneratedComputeProgram(
  scheduleIR: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
): GeneratedComputeProgramIR {
  const slots = collectComputeSlots(scheduleIR);
  const offsetConstants = new Map<ValueSlot, string>();
  let maxActiveLanes = 1;

  // [LAW:one-source-of-truth] Compute addressing metadata is derived once from
  // compiler-owned runtimeAddressTable; lowering/validation consumes this
  // metadata and owns WGSL emission.
  for (const slot of slots) {
    const arena = runtimeAddressTable.slotToArena.get(slot);
    if (!arena) continue;
    offsetConstants.set(slot, `OFFSET_SLOT_${slot}`);
    maxActiveLanes = Math.max(maxActiveLanes, arena.laneCount);
  }

  for (const mapping of scheduleIR.stateMappings) {
    maxActiveLanes = Math.max(maxActiveLanes, mapping.laneCount);
  }

  return {
    maxActiveLanes,
    offsetConstants,
  };
}
/**
 * Extract the primary expression ID from a schedule step.
 * Returns null for infrastructure steps that don't reference a value expression.
 */
function getStepExprId(step: Step): ValueExprId | null {
  switch (step.kind) {
    case 'eventDispatch':
      return step.expr;
    case 'materialize':
      return step.field;
    case 'stateWrite':
    case 'fieldStateWrite':
      return step.value;
    case 'render':
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
    case 'eventDispatch':
      return null;
    case 'materialize':
      return step.target;
    case 'render':
    case 'stateWrite':
    case 'fieldStateWrite':
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
): InstanceId | undefined {
  const expr = valueExprs[fieldId];
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
