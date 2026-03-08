import type { CompiledProgramIR } from '../compiler/ir/program';
import type { InstanceId, ValueSlot } from '../compiler/ir/Indices';
import type { InstanceDecl, Step, StepMaterialize } from '../compiler/ir/types';
import {
  packDrawPrepSinkTableV1,
  resetShapeBankFrameAllocator,
  resolveTime,
  type RuntimeState,
} from '../runtime';
import { arenaEncodeFromAoS, type ArenaSlotDescriptor } from '../runtime/ArenaValueStore';
import { getExprAddressTable } from '../runtime/ExprAddressTable';
import { resolveInstanceLaneCount } from '../runtime/InstanceCountResolver';
import { createMaterializeScratch } from '../runtime/MaterializeScratch';
import { materializeValueExpr } from '../runtime/ValueExprMaterializer';

const MAX_UINT32 = 0xFFFF_FFFF;
const INSTALL_MATERIALIZE_SCRATCH = createMaterializeScratch();

function assertFiniteUint32(value: number, context: string): number {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_UINT32
  ) {
    throw new Error(`${context} must be a uint32 (got ${String(value)})`);
  }
  return value;
}

function materializeStepToArena(
  program: CompiledProgramIR,
  state: RuntimeState,
  step: StepMaterialize,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  pureFnContext: { kernelRegistry: CompiledProgramIR['kernelRegistry'] },
): void {
  const arenaDesc = slotToArena.get(step.target);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error(`runtime-hotpath: materialize slot ${String(step.target)} missing arena descriptor`);
  }
  if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      `runtime-hotpath: materialize slot ${String(step.target)} exceeds arena ` +
      `(need=${arenaDesc.offset + arenaDesc.length}, have=${state.arena.length})`,
    );
  }
  const instanceDecl = instances.get(step.instanceId);
  const count = instanceDecl
    ? resolveInstanceLaneCount(instanceDecl, program, state, pureFnContext)
    : 0;
  const buffer = materializeValueExpr(
    step.field,
    program.valueExprs,
    step.instanceId,
    count,
    state,
    program,
    undefined,
    INSTALL_MATERIALIZE_SCRATCH,
    pureFnContext,
  );
  arenaEncodeFromAoS(state.arena, arenaDesc, buffer);
}

function materializeProgramForGpuInstall(
  program: CompiledProgramIR,
  state: RuntimeState,
  nowMs: number,
): void {
  const instances = program.schedule.instances;
  const addressTable = getExprAddressTable(program);
  // [LAW:one-source-of-truth] Worker materialization uses compiler-owned
  // ExprAddressTable metadata; no local descriptor synthesis.
  state.cache.scalarExprToArenaAddress = addressTable.scalarExprToArenaAddress;
  resetShapeBankFrameAllocator(state.shapeBank);
  INSTALL_MATERIALIZE_SCRATCH.reset();
  state.time = resolveTime(nowMs, program.schedule.timeModel, state.timeState);
  // [LAW:single-enforcer] Dynamic instance counts are seeded through the shared
  // InstanceCountResolver cache contract consumed by DrawPrepSinkTablePacker.
  state.cache.instanceLaneCounts?.clear();
  state.cache.instanceLaneCountFrameId = state.cache.frameId;
  const pureFnContext = { kernelRegistry: program.kernelRegistry };
  for (const instanceDecl of instances.values()) {
    resolveInstanceLaneCount(instanceDecl, program, state, pureFnContext);
  }
  for (const step of program.schedule.steps as readonly Step[]) {
    if (step.kind !== 'materialize') continue;
    materializeStepToArena(program, state, step, instances, addressTable.slotToArena, pureFnContext);
  }
}

export interface RuntimeHotpathInstallPlanes {
  readonly sinkTableWords: Uint32Array | null;
  readonly sinkTableWordCount: number;
  readonly shapeBankWords: Uint32Array;
  readonly shapeBankWordCount: number;
}

export function buildRuntimeHotpathInstallPlanes(
  program: CompiledProgramIR,
  state: RuntimeState,
  nowMs: number,
): RuntimeHotpathInstallPlanes {
  materializeProgramForGpuInstall(program, state, nowMs);
  // [LAW:one-source-of-truth] Sink-table metadata comes from one canonical
  // packer contract for all program types (fluid and non-fluid).
  const packed = packDrawPrepSinkTableV1(program, state);
  const sinkTableWords = packed
    ? new Uint32Array(packed.words.subarray(0, packed.wordCount))
    : null;
  const sinkTableWordCount = packed?.wordCount ?? 0;
  const shapeBankWordCount = assertFiniteUint32(
    state.shapeBank.volatilePtr,
    'gpuDrivenShapeBank.wordCount',
  );
  const shapeBankWords = new Uint32Array(shapeBankWordCount);
  if (shapeBankWordCount > 0) {
    shapeBankWords.set(state.shapeBank.data.subarray(0, shapeBankWordCount), 0);
  }
  return {
    sinkTableWords,
    sinkTableWordCount,
    shapeBankWords,
    shapeBankWordCount,
  };
}
