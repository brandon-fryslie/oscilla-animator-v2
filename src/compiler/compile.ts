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
import type { NormalizedPatch } from './frontend/normalize-indexing';
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
  GeneratedComputeProgramIR,
  ExprProvenanceIR,
  ExprUserTarget,
} from './ir/program';
import type { ValueSlot } from './ir/Indices';
import { SCALAR_INSTANCE_ID } from './ir/Indices';
import type { BlockId } from '../types';
import type { UnlinkedIRFragments } from './backend/lower-blocks';
import type { ScheduleIR } from './backend/schedule-program';
import type { AcyclicOrLegalGraph } from './ir/patches';
import type { EventHub } from '../events/EventHub';
import { requireInst, requireManyInstance } from '../core/canonical-types';
import { deriveStorageLayout, deriveArenaDescriptor } from './ir/storage-class';
import type { ArenaSlotDescriptor } from '../runtime/ArenaValueStore';
import type { ValueExpr, ValueExprId } from './ir/value-expr';
import type { Step } from './ir/types';
import { compilationInspector } from '../services/CompilationInspectorService';
import { computeRenderReachableBlocks } from './reachability';
import { resolveKernels } from './resolve-kernels';
import { createDefaultRegistry } from '../runtime/kernels/default-registry';
import { compileFrontend, type FrontendResult, type FrontendError } from './frontend';
import type { CompileError } from './types';

import { registerAllBlocks } from '../blocks/all';

// Import passes
import { pass3Time } from './backend/derive-time-model';
import { pass4DepGraph } from './backend/derive-dep-graph';
import { pass5CycleValidation } from './backend/schedule-scc';
import { pass6BlockLowering } from './backend/lower-blocks';
import { pass7Schedule } from './backend/schedule-program';
import { allocateContinuityPipeline } from './backend/continuity-pipeline';
import { AddressRegistry } from '../graph/address-registry';

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
  readonly events: EventHub;
  /** Precomputed frontend result. When provided, compile() reuses it. Otherwise runs compileFrontend() internally. */
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

  // [LAW:one-source-of-truth] compile() owns the inspector snapshot lifecycle unconditionally.
  // [LAW:single-enforcer] Inspector is internally resilient — no try/catch needed.
  compilationInspector.beginCompile(compileId);

  try {
    // =========================================================================
    // Frontend: Use precomputed result or run compileFrontend()
    // [LAW:dataflow-not-control-flow] compileFrontend always returns FrontendResult.
    // =========================================================================
    const frontend: FrontendResult = options?.precomputedFrontend
      ? options.precomputedFrontend
      : compileFrontend(patch);

    if (!frontend.backendReady) {
      return makeFailure(frontend.errors.map(frontendErrorToCompileError));
    }

    const normalized = frontend.normalizedPatch;
    const typedPatch = frontend.typedPatch;

    // Capture frontend passes (for inspection)
    compilationInspector.capturePass('normalization', patch, normalized);
    compilationInspector.capturePass('type-constraints', normalized, typedPatch);
    compilationInspector.capturePass('type-graph', normalized, typedPatch);
    compilationInspector.capturePass('axis-validation', typedPatch, {
      errors: frontend.errors,
    });
    compilationInspector.capturePass('cycle-analysis', typedPatch,
      frontend.cycleSummary,
    );

    // =========================================================================
    // Backend: Always runs (requires frontend output)
    // =========================================================================

    // Pass 3: Time Topology
    const timeResolvedPatch = pass3Time(typedPatch);

    compilationInspector.capturePass('time', typedPatch, timeResolvedPatch);

    // Pass 4: Dependency Graph
    const depGraphPatch = pass4DepGraph(timeResolvedPatch);

    compilationInspector.capturePass('depgraph', timeResolvedPatch, depGraphPatch);

    // Pass 5: Cycle Validation (SCC)
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    compilationInspector.capturePass('scc', depGraphPatch, acyclicPatch);

    // Pass 6: Block Lowering
    const addressRegistry = AddressRegistry.buildFromPatch(normalized.patch);
    const unlinkedIR = pass6BlockLowering(acyclicPatch, {
      events: options?.events,
      compileId,
      patchRevision: options?.patchRevision,
      addressRegistry,
    });

    compilationInspector.capturePass('block-lowering', acyclicPatch, unlinkedIR);

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
        return makeFailure(reachableErrors);
      }
    }


    // Pass 6b: Continuity Pipeline Allocation
    // [LAW:single-enforcer] All continuity pipeline slots allocated through builder.
    const continuityPipeline = allocateContinuityPipeline(unlinkedIR, acyclicPatch);

    // Pass 7: Schedule Construction (pure ordering, no allocation)
    const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch, continuityPipeline);

    compilationInspector.capturePass('schedule', unlinkedIR, scheduleIR);

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
      })));
    }

    // Convert to CompiledProgramIR (now with registry)
    const compiledIR = convertLinkedIRToProgram(unlinkedIR, scheduleIR, acyclicPatch, registry);

    compilationInspector.endCompile('success');
    return {
      kind: 'ok',
      program: compiledIR,
      warnings: unreachableBlockWarnings,
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    const errorCode = (e as { code?: string }).code || 'CompilationFailed';
    return makeFailure([{ code: errorCode, message: error.message || 'Unknown compilation error' }]);
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
  };
}

// [LAW:single-enforcer] Events are emitted by CompileOrchestrator, not compile().
function makeFailure(errors: CompileError[]): CompileFailure {
  compilationInspector.endCompile('failure');
  return { kind: 'error', errors };
}

/**
 * Compiler invariants are non-negotiable backend correctness checks and must
 * not be downgraded to unreachable warnings.
 */
function isAlwaysFatalInvariantError(error: CompileError): boolean {
  return error.details?.compilerInvariant === 'unresolvedPlaceholderInstance';
}

function assertCanonicalRuntimeStorage(storage: SlotMetaEntry['storage']): RuntimeSlotEntry['storage'] {
  if (storage === 'f32' || storage === 'i32' || storage === 'u32' || storage === 'shape2d') {
    return storage;
  }
  // [LAW:single-enforcer] Compiler slot derivation is the single boundary that
  // enforces canonical runtime ABI storage vocabulary.
  throw new Error('Non-canonical runtime storage emitted by deriveStorageLayout: ' + storage);
}

function buildRuntimeAddressTable(
  runtimeSlots: readonly RuntimeSlotEntry[],
  scheduleIR: ScheduleIR,
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
    if (slotEntry.arena.offset >= 0) {
      slotToArena.set(slotEntry.slot, slotEntry.arena);
    }
  }

  const fieldExprToSlot = new Map<number, ValueSlot>();
  const scalarExprToArenaAddress = new Map<number, { slot: ValueSlot; arena: ArenaSlotDescriptor; component: number }>();
  const steps = scheduleIR.steps as readonly Step[];
  for (const step of steps) {
    if (step.kind === 'materialize') {
      fieldExprToSlot.set(step.field as number, step.target);
      if (step.instanceId === SCALAR_INSTANCE_ID) {
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
    if (step.kind === 'evalOne') {
      const arenaDesc = slotToArena.get(step.target);
      if (arenaDesc) {
        scalarExprToArenaAddress.set(step.expr as number, {
          slot: step.target,
          arena: arenaDesc,
          component: 0,
        });
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
        const valueId = ref.id as unknown as ValueExprId;
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
  const runtimeSlots: RuntimeSlotEntry[] = [];
  const instances = builder.getInstances();
  const arenaLayout: ArenaSlotDescriptor[] = [];
  let arenaOffset = 0;

  const storageOffsets: Record<RuntimeSlotEntry['storage'], number> = {
    f32: 0,
    i32: 0,
    u32: 0,
    shape2d: 0,
  };

  const slotCount = builder.getSlotCount();
  const renderSoaSlots = new Set<ValueSlot>();
  const continuitySlots = new Set<ValueSlot>();
  for (const step of scheduleIR.steps) {
    if (step.kind === 'render') {
      renderSoaSlots.add(step.positionSlot);
      renderSoaSlots.add(step.colorSlot);
      if (step.rotationSlot !== undefined) renderSoaSlots.add(step.rotationSlot);
      if (step.scale2Slot !== undefined) renderSoaSlots.add(step.scale2Slot);
      if (step.controlPoints?.k === 'slot') renderSoaSlots.add(step.controlPoints.slot);
      if (step.scale?.k === 'slot') renderSoaSlots.add(step.scale.slot);
    } else if (step.kind === 'continuityApply') {
      continuitySlots.add(step.baseSlot);
      continuitySlots.add(step.outputSlot);
    }
  }

  for (let slotId = 0; slotId < slotCount; slotId++) {
    const slot = slotId as ValueSlot;
    const slotInfo = slotTypes.get(slot);
    if (!slotInfo?.type) throw new Error(`Slot ${slot} has no registered type — IR builder bug`);
    const type = slotInfo.type;

    // [LAW:one-source-of-truth] Single derivation point for storage class + stride.
    const { storage: derivedStorage, stride } = deriveStorageLayout(type, slotInfo.stride);
    const storage = assertCanonicalRuntimeStorage(derivedStorage);

    const offset = storageOffsets[storage];
    storageOffsets[storage] += stride;

    slotMeta.push({ slot, storage, offset, stride, type });

    // Arena descriptor: flat Float32Array layout for all numeric slots.
    const card = requireInst(type.extent.cardinality, 'cardinality');
    const useRenderSoaPacking =
      card.kind === 'many' &&
      stride > 1 &&
      renderSoaSlots.has(slot) &&
      !continuitySlots.has(slot);
    const desc = deriveArenaDescriptor(
      type,
      arenaOffset,
      instances,
      slotInfo.stride,
      useRenderSoaPacking ? 'soa' : 'aos',
    );
    arenaLayout.push(desc);
    runtimeSlots.push({
      slot,
      storage,
      offset,
      stride,
      type,
      arena: desc,
    });
    arenaOffset += desc.length;
  }

  // Build output specs from canonical output contract only.
  const outputs: OutputSpecIR[] = [{ kind: 'renderFrame' }];
  const drawPrepProgram = buildDrawPrepProgram(scheduleIR);
  const runtimeAddressTable = buildRuntimeAddressTable(runtimeSlots, scheduleIR);
  assertRuntimeAddressTableCoverage(runtimeSlots, runtimeAddressTable);
  const generatedComputeProgram = buildGeneratedComputeProgram(scheduleIR, runtimeAddressTable);

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
        const valueId = ref.id as unknown as ValueExprId;
        const expr = valueExprNodes[valueId as unknown as number];
        if (!expr) continue;
        const card = requireInst(expr.type.extent.cardinality, 'cardinality').kind;
        const temp = requireInst(expr.type.extent.temporality, 'temporality').kind;
        const slot = ref.slot;

        // Generate stable port ID
        const portIndex = portCounter++;

        // [LAW:one-source-of-truth] Slot mapping is only for slot-backed outputs.
        // Discrete outputs are represented in ports metadata but do not require slot aliases.
        if (slot !== undefined) {
          slotToPort.set(slot, portIndex);
        }

        // Add port binding info
        ports.push({
          port: portIndex,
          block: blockIndex,
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

      const portNameResult = exprIdToPortName.get(exprId as unknown as number);
      const portName = portNameResult !== undefined ? portNameResult : null;
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
    runtimeSlots,
    runtimeAddressTable,
    debugIndex,
    fieldSlotRegistry,
    renderGlobals, // NEW - Camera system: populated from builder
    kernelRegistry: registry, // Phase B: Kernel registry with resolved handles
    constantProvenance: unlinkedIR.constantProvenance.size > 0
      ? unlinkedIR.constantProvenance
      : undefined,
    instanceCountProvenance: unlinkedIR.instanceCountProvenance.size > 0
      ? unlinkedIR.instanceCountProvenance
      : undefined,
    arenaLayout,
    arenaTotalFloats: arenaOffset,
    drawPrepProgram,
    generatedComputeProgram,
  };

  return program;
}

function buildDrawPrepProgram(scheduleIR: ScheduleIR): DrawPrepProgramIR {
  const sinks: DrawPrepSinkIR[] = [];
  const steps = scheduleIR.steps as readonly Step[];
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    if (step.kind !== 'render') continue;

    const instance = scheduleIR.instances.get(step.instanceId);
    if (!instance) {
      throw new Error(`DrawPrepProgram: render step references missing instance ${String(step.instanceId)}`);
    }
    const staticInstanceCount = typeof instance.count === 'number' ? instance.count : undefined;

    sinks.push({
      sinkIndex: sinks.length,
      renderStepIndex: stepIndex,
      instanceId: step.instanceId,
      indirectRecordIndex: sinks.length,
      instanceCountMode: staticInstanceCount === undefined ? 'dynamic' : 'static',
      staticInstanceCount,
    });
  }
  const wgslLines: string[] = [
    '// Auto-generated draw-prep WGSL (v3 stage-3).',
    'struct DrawPrepParams {',
    '  // v0 = [indexCount, instanceCount, firstIndex, baseVertexBits]',
    '  v0: vec4<u32>,',
    '  // v1 = [firstInstance, recordIndex, maxRecords, _]',
    '  v1: vec4<u32>,',
    '};',
    '',
    '@group(0) @binding(0) var<storage, read_write> indirectArgs: array<u32>;',
    '@group(0) @binding(1) var<uniform> drawPrepParams: DrawPrepParams;',
    '',
    'const INDIRECT_ARGS_WORDS: u32 = 5u;',
    '',
  ];
  // [LAW:one-source-of-truth] Draw-prep sink constants are emitted from one
  // canonical compiler sink table used by runtime and shader generation.
  for (const sink of sinks) {
    const instanceCountLiteral =
      sink.instanceCountMode === 'static'
        ? `${sink.staticInstanceCount ?? 0}u`
        : '/* dynamic instance count */ 0u';
    const isStaticLiteral = sink.instanceCountMode === 'static' ? '1u' : '0u';
    wgslLines.push(`const DRAW_SINK_${sink.sinkIndex}_RECORD: u32 = ${sink.indirectRecordIndex}u;`);
    wgslLines.push(`const DRAW_SINK_${sink.sinkIndex}_IS_STATIC: u32 = ${isStaticLiteral};`);
    wgslLines.push(`const DRAW_SINK_${sink.sinkIndex}_INSTANCE_COUNT: u32 = ${instanceCountLiteral};`);
  }
  wgslLines.push(
    '',
    'fn resolveInstanceCount(recordIndex: u32, fallbackCount: u32) -> u32 {',
    '  var count = fallbackCount;',
    '  switch (recordIndex) {',
  );
  for (const sink of sinks) {
    wgslLines.push(
      `    case DRAW_SINK_${sink.sinkIndex}_RECORD: {`,
      `      count = select(count, DRAW_SINK_${sink.sinkIndex}_INSTANCE_COUNT, DRAW_SINK_${sink.sinkIndex}_IS_STATIC == 1u);`,
      '    }',
    );
  }
  wgslLines.push(
    '    default: {}',
    '  }',
    '  return count;',
    '}',
    '',
    '@compute @workgroup_size(1)',
    'fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {',
    '  if (gid.x > 0u) {',
    '    return;',
    '  }',
    '',
    '  let recordIndex = drawPrepParams.v1.y;',
    '  let maxRecords = drawPrepParams.v1.z;',
    '  if (recordIndex >= maxRecords) {',
    '    return;',
    '  }',
    '',
    '  let base = recordIndex * INDIRECT_ARGS_WORDS;',
    '  indirectArgs[base + 0u] = drawPrepParams.v0.x; // indexCount',
    '  indirectArgs[base + 1u] = resolveInstanceCount(recordIndex, drawPrepParams.v0.y); // instanceCount',
    '  indirectArgs[base + 2u] = drawPrepParams.v0.z; // firstIndex',
    '  indirectArgs[base + 3u] = drawPrepParams.v0.w; // baseVertex bits',
    '  indirectArgs[base + 4u] = drawPrepParams.v1.x; // firstInstance',
    '}',
  );
  return { sinks, wgsl: wgslLines.join('\n') };
}

function collectComputeSlots(scheduleIR: ScheduleIR): ValueSlot[] {
  const slots = new Set<ValueSlot>();
  for (const step of scheduleIR.steps) {
    switch (step.kind) {
      case 'evalOne':
        slots.add(step.target);
        break;
      case 'materialize':
        slots.add(step.target);
        break;
      case 'continuityApply':
        slots.add(step.baseSlot);
        slots.add(step.outputSlot);
        break;
      case 'render':
        slots.add(step.positionSlot);
        slots.add(step.colorSlot);
        if (step.rotationSlot !== undefined) slots.add(step.rotationSlot);
        if (step.scale2Slot !== undefined) slots.add(step.scale2Slot);
        if (step.controlPoints?.k === 'slot') slots.add(step.controlPoints.slot);
        if (step.scale?.k === 'slot') slots.add(step.scale.slot);
        break;
      case 'eventDispatch':
      case 'stateWrite':
      case 'fieldStateWrite':
      case 'continuityMapBuild':
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
  const lines: string[] = [
    '// Auto-generated compute WGSL (v3 stage-2 scaffold).',
    '@group(0) @binding(0) var<storage, read> arena_in: array<f32>;',
    '@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;',
    '',
  ];

  for (const slot of slots) {
    const arena = runtimeAddressTable.slotToArena.get(slot);
    if (!arena) continue;
    const constantName = `OFFSET_SLOT_${slot}`;
    offsetConstants.set(slot, constantName);
    lines.push(`const ${constantName}: u32 = ${arena.offset}u;`);
  }

  lines.push(
    '',
    '@compute @workgroup_size(64)',
    'fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {',
    '  let lane = gid.x;',
  );

  for (const slot of slots) {
    const arena = runtimeAddressTable.slotToArena.get(slot);
    const constantName = offsetConstants.get(slot);
    if (!arena || !constantName) continue;
    // [LAW:dataflow-not-control-flow] Generated kernels use one fixed copy pass
    // shape; slot variation is encoded in injected offsets.
    lines.push(
      `  arena_out[${constantName} + lane] = arena_in[${constantName} + lane];`,
    );
  }

  lines.push('}');
  return {
    wgsl: lines.join('\n'),
    offsetConstants,
  };
}


/**
 * Extract the primary expression ID from a schedule step.
 * Returns null for infrastructure steps that don't reference a value expression.
 */
function getStepExprId(step: Step): ValueExprId | null {
  switch (step.kind) {
    case 'evalOne':
    case 'eventDispatch':
      return step.expr;
    case 'materialize':
      return step.field;
    case 'stateWrite':
    case 'fieldStateWrite':
      return step.value;
    case 'render':
      return step.scale?.k === 'one' ? step.scale.id : null;
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
    case 'evalOne':
      return step.target;
    case 'eventDispatch':
      return null;
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
