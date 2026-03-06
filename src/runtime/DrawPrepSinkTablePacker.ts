import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { Step, StepRender } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { SHAPE_BANK_HEADER_WORDS } from './RuntimeState';
import { resolveArenaAddress } from './ArenaValueStore';
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

function resolveSlotShapeHandle(
  program: CompiledProgramIR,
  state: RuntimeState,
  step: StepRender,
  instanceCount: number,
): number {
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
  const sinkInstanceCounts: number[] = [];
  let totalInstanceCount = 0;
  for (let sinkIndex = 0; sinkIndex < drawPrepProgram.sinks.length; sinkIndex++) {
    const instanceCount = resolveSinkInstanceCount(program, state, sinkIndex);
    sinkInstanceCounts.push(instanceCount);
    totalInstanceCount = assertFiniteUint32(
      totalInstanceCount + instanceCount,
      'totalInstanceCount',
    );
  }
  // [LAW:single-enforcer] exception: runtime packs canonical per-frame instance
  // payload directly into sink-table transport while worker-side arena ownership
  // is being migrated.
  const PER_INSTANCE_PAYLOAD_WORDS = 11;
  const baseWordCount = computeDrawPrepSinkTableWordCapacity(header.totalRecordCount);
  const wordCount = assertFiniteUint32(
    baseWordCount + totalInstanceCount * PER_INSTANCE_PAYLOAD_WORDS,
    'sinkTableWordCount',
  );
  const words = ensureTableBuffer(state, wordCount);
  words.fill(0, 0, wordCount);
  writeDrawPrepSinkTableHeader(words, header);

  let firstInstance = 0;
  let payloadCursor = baseWordCount;
  for (let sinkIndex = 0; sinkIndex < drawPrepProgram.sinks.length; sinkIndex++) {
    const sink = drawPrepProgram.sinks[sinkIndex];
    const renderStep = requireRenderStep(program, sink.renderStepIndex);
    const instanceCount = sinkInstanceCounts[sinkIndex] ?? 0;
    const shapeHandleWordOffset = resolveSlotShapeHandle(program, state, renderStep, instanceCount);
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
    const shapeSlotAddress = resolveSlotArenaAddress(
      program,
      renderStep.shape.slot,
      `shapeSlot sink(instance=${String(renderStep.instanceId)})`,
    );
    const scaleSlotAddress = resolveSlotArenaAddress(
      program,
      renderStep.scale.slot,
      `scaleSlot sink(instance=${String(renderStep.instanceId)})`,
    );
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
    const positionBaseOffset = payloadCursor;
    payloadCursor += instanceCount * 2;
    const colorBaseOffset = payloadCursor;
    payloadCursor += instanceCount * 4;
    const scaleBaseOffset = payloadCursor;
    payloadCursor += instanceCount;
    const rotationBaseOffset = payloadCursor;
    payloadCursor += instanceCount;
    const scale2BaseOffset = payloadCursor;
    payloadCursor += instanceCount * 2;
    const shapeSlotBaseOffset = payloadCursor;
    payloadCursor += instanceCount;

    for (let lane = 0; lane < instanceCount; lane++) {
      const positionX = readArenaNumber(positionAddress, state, lane, 0);
      const positionY = readArenaNumber(positionAddress, state, lane, 1);
      const colorR = readArenaNumber(colorAddress, state, lane, 0);
      const colorG = readArenaNumber(colorAddress, state, lane, 1);
      const colorB = readArenaNumber(colorAddress, state, lane, 2);
      const colorA = readArenaNumber(colorAddress, state, lane, 3);
      const scaleValue = readArenaNumber(scaleSlotAddress, state, lane, 0);
      const rotationValue = rotationSlotAddress
        ? readArenaNumber(rotationSlotAddress, state, lane, 0)
        : 0;
      const scale2X = scale2SlotAddress
        ? readArenaNumber(scale2SlotAddress, state, lane, 0)
        : 1;
      const scale2Y = scale2SlotAddress
        ? readArenaNumber(scale2SlotAddress, state, lane, 1)
        : 1;
      const shapeHandle = assertFiniteUint32(
        Math.trunc(readArenaNumber(shapeSlotAddress, state, lane, 0)),
        `shapeSlotHandle lane=${lane}`,
      );
      words[positionBaseOffset + lane] = float32ToUint32Bits(positionX);
      words[positionBaseOffset + instanceCount + lane] = float32ToUint32Bits(positionY);
      words[colorBaseOffset + lane] = float32ToUint32Bits(colorR);
      words[colorBaseOffset + instanceCount + lane] = float32ToUint32Bits(colorG);
      words[colorBaseOffset + instanceCount * 2 + lane] = float32ToUint32Bits(colorB);
      words[colorBaseOffset + instanceCount * 3 + lane] = float32ToUint32Bits(colorA);
      words[scaleBaseOffset + lane] = float32ToUint32Bits(scaleValue);
      words[rotationBaseOffset + lane] = float32ToUint32Bits(rotationValue);
      words[scale2BaseOffset + lane] = float32ToUint32Bits(scale2X);
      words[scale2BaseOffset + instanceCount + lane] = float32ToUint32Bits(scale2Y);
      words[shapeSlotBaseOffset + lane] = shapeHandle;
    }

    writeDrawPrepSinkRecord(words, sinkIndex, {
      sinkIndex: sink.sinkIndex,
      drawMode: drawModeToCode(sink.drawMode),
      shapeHandleWordOffset,
      indirectRecordIndex: sink.indirectRecordIndex,
      instanceCount,
      firstInstance: packedFirstInstance,
      renderStepIndex: sink.renderStepIndex,
      shapeSourceCode: 1,
      positionBaseOffset,
      positionLaneStride: 1,
      positionComponentStride: instanceCount,
      colorBaseOffset,
      colorLaneStride: 1,
      colorComponentStride: instanceCount,
      scaleModeCode: 2,
      scaleValueOrBaseOffset: scaleBaseOffset,
      scaleLaneStride: 1,
      scaleComponentStride: 1,
      rotationModeCode: 1,
      rotationBaseOffset,
      rotationLaneStride: 1,
      rotationComponentStride: 1,
      scale2ModeCode: 1,
      scale2BaseOffset,
      scale2LaneStride: 1,
      scale2ComponentStride: instanceCount,
      shapeSlotBaseOffset,
      shapeSlotLaneStride: 1,
      shapeSlotComponentStride: 1,
    });

    const nextFirstInstance = packedFirstInstance + instanceCount;
    firstInstance = assertFiniteUint32(nextFirstInstance, 'firstInstancePrefixSum');
  }
  if (payloadCursor !== wordCount) {
    throw new Error(
      'DrawPrepSinkTablePacker: payload cursor mismatch ' +
      `(cursor=${payloadCursor}, wordCount=${wordCount})`,
    );
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
