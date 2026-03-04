import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { Step, StepRender } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { SHAPE_BANK_HEADER_WORDS } from './RuntimeState';
import { arenaIndex, resolveArenaAddress } from './ArenaValueStore';
import {
  buildDrawPrepSinkTableHeader,
  computeDrawPrepSinkTableWordCapacity,
  drawModeToCode,
  writeDrawPrepSinkRecord,
  writeDrawPrepSinkTableHeader,
  type DrawPrepSinkTableHeaderV1,
} from './DrawPrepSinkTable';

export interface PackedDrawPrepSinkTableV1 {
  readonly words: Uint32Array;
  readonly wordCount: number;
  readonly header: DrawPrepSinkTableHeaderV1;
}

const f32Scratch = new Float32Array(1);
const u32Scratch = new Uint32Array(f32Scratch.buffer);

function float32ToUint32Bits(value: number): number {
  f32Scratch[0] = value;
  return u32Scratch[0] >>> 0;
}

function assertFiniteUint32(value: number, context: string): number {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || !Number.isSafeInteger(value)
    || value < 0
    || value > 0xFFFF_FFFF
  ) {
    throw new Error(`DrawPrepSinkTablePacker: ${context} must be uint32, got ${String(value)}`);
  }
  return value;
}

function ensureTableBuffer(state: RuntimeState, requiredWords: number): Uint32Array {
  const existing = state.cache.drawPrepSinkTableWords;
  if (existing && existing.length >= requiredWords) {
    return existing;
  }
  // [LAW:no-shared-mutable-globals] Sink-table scratch capacity is owned by
  // RuntimeState frame cache; no module-global shared staging is allowed.
  const next = new Uint32Array(requiredWords);
  state.cache.drawPrepSinkTableWords = next;
  return next;
}

function requireRenderStep(program: CompiledProgramIR, renderStepIndex: number): StepRender {
  const step = (program.schedule.steps as readonly Step[])[renderStepIndex];
  if (!step || step.kind !== 'render') {
    throw new Error(
      'DrawPrepSinkTablePacker: draw-prep sink references invalid render step ' +
        `(renderStepIndex=${renderStepIndex})`,
    );
  }
  return step;
}

interface PackedArenaAddress {
  readonly baseOffset: number;
  readonly laneStride: number;
  readonly componentStride: number;
}

function resolveSlotArenaAddress(
  program: CompiledProgramIR,
  slot: ValueSlot,
  context: string,
): PackedArenaAddress {
  const descriptor = program.runtimeAddressTable?.slotToArena.get(slot);
  if (!descriptor) {
    throw new Error(
      'DrawPrepSinkTablePacker: missing runtimeAddressTable slotToArena descriptor for ' + context,
    );
  }
  const address = resolveArenaAddress(descriptor);
  return {
    baseOffset: assertFiniteUint32(address.baseOffset, `${context}.baseOffset`),
    laneStride: assertFiniteUint32(address.laneStride, `${context}.laneStride`),
    componentStride: assertFiniteUint32(address.componentStride, `${context}.componentStride`),
  };
}

function readArenaNumber(address: PackedArenaAddress, state: RuntimeState, lane: number, component: number): number {
  const index =
    address.baseOffset
    + assertFiniteUint32(lane, 'arenaRead.lane') * address.laneStride
    + assertFiniteUint32(component, 'arenaRead.component') * address.componentStride;
  if (index >= state.arena.length) {
    throw new Error(
      'DrawPrepSinkTablePacker: arena read out of bounds ' +
        `(index=${index}, arenaLength=${state.arena.length})`,
    );
  }
  return state.arena[index] as number;
}

function resolveOneShapeHandle(program: CompiledProgramIR, state: RuntimeState, step: StepRender): number {
  if (step.shape.k !== 'oneHandle') {
    throw new Error('resolveOneShapeHandle: expected oneHandle shape source');
  }
  const address = program.runtimeAddressTable?.scalarExprToArenaAddress.get(step.shape.id as number);
  if (!address) {
    throw new Error(
      'DrawPrepSinkTablePacker: missing scalar arena address for sink shape handle expr ' +
        String(step.shape.id),
    );
  }

  const rawHandle = state.arena[arenaIndex(address.arena, 0, address.component)];
  if (!Number.isFinite(rawHandle) || !Number.isInteger(rawHandle)) {
    throw new Error(
      'DrawPrepSinkTablePacker: sink oneHandle shape source must be a finite integer, got ' + String(rawHandle),
    );
  }
  return assertFiniteUint32(Math.trunc(rawHandle), 'shapeHandleWordOffset');
}

function resolveSlotShapeHandle(
  program: CompiledProgramIR,
  state: RuntimeState,
  step: StepRender,
  instanceCount: number,
): number {
  if (step.shape.k !== 'slot') {
    throw new Error('resolveSlotShapeHandle: expected slot shape source');
  }
  if (instanceCount <= 0) {
    return 0;
  }
  const shapeAddress = resolveSlotArenaAddress(
    program,
    step.shape.slot,
    `shapeSlot sink(instance=${String(step.instanceId)})`,
  );
  const firstHandle = readArenaNumber(shapeAddress, state, 0, 0);
  if (!Number.isFinite(firstHandle) || !Number.isInteger(firstHandle)) {
    throw new Error(
      'DrawPrepSinkTablePacker: shape slot lane 0 handle must be a finite integer, got ' + String(firstHandle),
    );
  }
  const representative = assertFiniteUint32(Math.trunc(firstHandle), 'shapeHandleWordOffset');
  for (let lane = 1; lane < instanceCount; lane++) {
    const laneHandle = readArenaNumber(shapeAddress, state, lane, 0);
    if (!Number.isFinite(laneHandle) || !Number.isInteger(laneHandle)) {
      throw new Error(
        'DrawPrepSinkTablePacker: shape slot lane handle must be a finite integer, got ' + String(laneHandle),
      );
    }
    const handle = assertFiniteUint32(Math.trunc(laneHandle), `shapeSlotHandle lane=${lane}`);
    if (handle !== representative) {
      // [LAW:no-mode-explosion] Heterogeneous per-instance shape handles inside one
      // sink would require dynamic sink fan-out; this slice keeps one sink→one
      // indirect record contract and fails explicitly.
      throw new Error(
        'DrawPrepSinkTablePacker: heterogeneous per-instance shape handles in one sink are unsupported ' +
          `(sinkInstanceId=${String(step.instanceId)}, lane0=${representative}, lane=${lane}, handle=${handle})`,
      );
    }
  }
  return representative;
}

function assertShapeHandleInBankWindow(state: RuntimeState, shapeHandleWordOffset: number, instanceCount: number): void {
  if (instanceCount <= 0) {
    return;
  }
  if (shapeHandleWordOffset + SHAPE_BANK_HEADER_WORDS > state.shapeBank.volatilePtr) {
    throw new Error(
      'DrawPrepSinkTablePacker: sink shape handle points outside live shape bank window ' +
        `(handle=${shapeHandleWordOffset}, volatilePtr=${state.shapeBank.volatilePtr})`,
    );
  }
}

function resolveScaleOneBits(program: CompiledProgramIR, state: RuntimeState, step: StepRender): number {
  if (!step.scale || step.scale.k !== 'one') {
    return 0;
  }
  const address = program.runtimeAddressTable?.scalarExprToArenaAddress.get(step.scale.id as number);
  if (!address) {
    throw new Error(
      'DrawPrepSinkTablePacker: missing scalar arena address for sink scale expr ' +
        String(step.scale.id),
    );
  }
  const rawScale = state.arena[arenaIndex(address.arena, 0, address.component)];
  if (!Number.isFinite(rawScale)) {
    throw new Error(
      'DrawPrepSinkTablePacker: sink scale one-value must be finite, got ' + String(rawScale),
    );
  }
  return assertFiniteUint32(float32ToUint32Bits(rawScale), 'scaleOneBits');
}

function resolveSinkInstanceCount(program: CompiledProgramIR, state: RuntimeState, sinkIndex: number): number {
  const drawPrepProgram = program.drawPrepProgram;
  if (!drawPrepProgram) {
    throw new Error('DrawPrepSinkTablePacker: missing drawPrepProgram');
  }
  const sink = drawPrepProgram.sinks[sinkIndex];
  if (!sink) {
    throw new Error(`DrawPrepSinkTablePacker: sink ${sinkIndex} missing`);
  }

  if (sink.instanceCountMode === 'static') {
    return assertFiniteUint32(
      sink.staticInstanceCount ?? Number.NaN,
      `staticInstanceCount sinkIndex=${sink.sinkIndex}`,
    );
  }

  if (state.cache.instanceLaneCountFrameId !== state.cache.frameId) {
    throw new Error(
      'DrawPrepSinkTablePacker: dynamic instance counts are stale for current frame ' +
        `(frameId=${state.cache.frameId}, cachedFrame=${state.cache.instanceLaneCountFrameId ?? -1})`,
    );
  }
  const dynamicCount = state.cache.instanceLaneCounts?.get(String(sink.instanceId));
  if (dynamicCount === undefined) {
    throw new Error(
      'DrawPrepSinkTablePacker: missing dynamic instance count for sink ' +
        `(sinkIndex=${sink.sinkIndex}, instanceId=${String(sink.instanceId)})`,
    );
  }
  return assertFiniteUint32(dynamicCount, `dynamicInstanceCount sinkIndex=${sink.sinkIndex}`);
}

export function packDrawPrepSinkTableV1(
  program: CompiledProgramIR,
  state: RuntimeState,
): PackedDrawPrepSinkTableV1 | null {
  const drawPrepProgram = program.drawPrepProgram;
  if (!drawPrepProgram) {
    state.cache.drawPrepSinkTableWords = undefined;
    state.cache.drawPrepSinkTableWordCount = 0;
    state.cache.drawPrepSinkTableFrameId = state.cache.frameId;
    return null;
  }

  // [LAW:one-source-of-truth] Compiler owns static sink ordering and indirect
  // region metadata; runtime packs only per-frame shape/count/first-instance.
  const header = buildDrawPrepSinkTableHeader(drawPrepProgram);
  const wordCount = computeDrawPrepSinkTableWordCapacity(header.totalRecordCount);
  const words = ensureTableBuffer(state, wordCount);
  words.fill(0, 0, wordCount);
  writeDrawPrepSinkTableHeader(words, header);

  let firstInstance = 0;
  for (let sinkIndex = 0; sinkIndex < drawPrepProgram.sinks.length; sinkIndex++) {
    const sink = drawPrepProgram.sinks[sinkIndex];
    const renderStep = requireRenderStep(program, sink.renderStepIndex);
    const instanceCount = resolveSinkInstanceCount(program, state, sinkIndex);
    const shapeHandleWordOffset =
      renderStep.shape.k === 'slot'
        ? resolveSlotShapeHandle(program, state, renderStep, instanceCount)
        : resolveOneShapeHandle(program, state, renderStep);
    assertShapeHandleInBankWindow(state, shapeHandleWordOffset, instanceCount);

    const packedFirstInstance = assertFiniteUint32(firstInstance, `firstInstance sinkIndex=${sink.sinkIndex}`);
    const positionAddress = resolveSlotArenaAddress(
      program,
      renderStep.controlPointsSlot,
      `controlPointsSlot sink(instance=${String(renderStep.instanceId)})`,
    );
    const colorAddress = resolveSlotArenaAddress(
      program,
      renderStep.colorSlot,
      `colorSlot sink(instance=${String(renderStep.instanceId)})`,
    );
    const shapeSlotAddress =
      renderStep.shape.k === 'slot'
        ? resolveSlotArenaAddress(
          program,
          renderStep.shape.slot,
          `shapeSlot sink(instance=${String(renderStep.instanceId)})`,
        )
        : null;
    const scaleSlotAddress =
      renderStep.scale?.k === 'slot'
        ? resolveSlotArenaAddress(
          program,
          renderStep.scale.slot,
          `scaleSlot sink(instance=${String(renderStep.instanceId)})`,
        )
        : null;
    const rotationSlotAddress =
      renderStep.rotationSlot !== undefined
        ? resolveSlotArenaAddress(
          program,
          renderStep.rotationSlot,
          `rotationSlot sink(instance=${String(renderStep.instanceId)})`,
        )
        : null;
    const scale2SlotAddress =
      renderStep.scale2Slot !== undefined
        ? resolveSlotArenaAddress(
          program,
          renderStep.scale2Slot,
          `scale2Slot sink(instance=${String(renderStep.instanceId)})`,
        )
        : null;
    const scaleModeCode = !renderStep.scale
      ? 0
      : renderStep.scale.k === 'one'
        ? 1
        : 2;
    const scaleValueOrBaseOffset = renderStep.scale?.k === 'one'
      ? resolveScaleOneBits(program, state, renderStep)
      : (scaleSlotAddress?.baseOffset ?? 0);

    writeDrawPrepSinkRecord(words, sinkIndex, {
      sinkIndex: sink.sinkIndex,
      drawMode: drawModeToCode(sink.drawMode),
      shapeHandleWordOffset,
      indirectRecordIndex: sink.indirectRecordIndex,
      instanceCount,
      firstInstance: packedFirstInstance,
      renderStepIndex: sink.renderStepIndex,
      shapeSourceCode: renderStep.shape.k === 'slot' ? 1 : 0,
      positionBaseOffset: positionAddress.baseOffset,
      positionLaneStride: positionAddress.laneStride,
      positionComponentStride: positionAddress.componentStride,
      colorBaseOffset: colorAddress.baseOffset,
      colorLaneStride: colorAddress.laneStride,
      colorComponentStride: colorAddress.componentStride,
      scaleModeCode,
      scaleValueOrBaseOffset,
      scaleLaneStride: scaleSlotAddress?.laneStride ?? 0,
      scaleComponentStride: scaleSlotAddress?.componentStride ?? 0,
      rotationModeCode: rotationSlotAddress ? 1 : 0,
      rotationBaseOffset: rotationSlotAddress?.baseOffset ?? 0,
      rotationLaneStride: rotationSlotAddress?.laneStride ?? 0,
      rotationComponentStride: rotationSlotAddress?.componentStride ?? 0,
      scale2ModeCode: scale2SlotAddress ? 1 : 0,
      scale2BaseOffset: scale2SlotAddress?.baseOffset ?? 0,
      scale2LaneStride: scale2SlotAddress?.laneStride ?? 0,
      scale2ComponentStride: scale2SlotAddress?.componentStride ?? 0,
      shapeSlotBaseOffset: shapeSlotAddress?.baseOffset ?? 0,
      shapeSlotLaneStride: shapeSlotAddress?.laneStride ?? 0,
      shapeSlotComponentStride: shapeSlotAddress?.componentStride ?? 0,
    });

    const nextFirstInstance = packedFirstInstance + instanceCount;
    firstInstance = assertFiniteUint32(nextFirstInstance, 'firstInstancePrefixSum');
  }

  state.cache.drawPrepSinkTableWords = words;
  state.cache.drawPrepSinkTableWordCount = wordCount;
  state.cache.drawPrepSinkTableFrameId = state.cache.frameId;
  return {
    words,
    wordCount,
    header,
  };
}
