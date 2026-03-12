import type { CompiledProgramIR, DrawPrepSinkIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { Step, StepRender } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { readShapeBankHeader, SHAPE_BANK_HEADER_WORDS } from './RuntimeState';
import { resolveArenaAddress } from './ArenaValueStore';
import {
  DRAW_PREP_SINK_DESCRIPTOR_WORDS,
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DrawPrepSinkDescriptorWord,
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

const OPTIONAL_MODE_CONSTANT = 0;
const OPTIONAL_MODE_SLOT = 1;

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
      // sink would require dynamic sink fan-out; one sink maps to one command.
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

function orderedSinkIndicesByDrawMode(sinks: readonly DrawPrepSinkIR[]): number[] {
  const indexed: number[] = [];
  const nonIndexed: number[] = [];
  for (let sinkIndex = 0; sinkIndex < sinks.length; sinkIndex++) {
    const sink = sinks[sinkIndex];
    if (sink?.drawMode === 'indexed') {
      indexed.push(sinkIndex);
    } else {
      nonIndexed.push(sinkIndex);
    }
  }
  return [...indexed, ...nonIndexed];
}

interface DrawCommandFields {
  readonly count: number;
  readonly first: number;
  readonly baseVertex: number;
  readonly materialId: number;
}

function resolveDrawCommandFields(
  state: RuntimeState,
  sink: DrawPrepSinkIR,
  shapeHandleWordOffset: number,
): DrawCommandFields {
  const shapeHeader = readShapeBankHeader(state.shapeBank.data, shapeHandleWordOffset);
  if (sink.drawMode === 'indexed') {
    return {
      count: assertFiniteUint32(shapeHeader.indexCount, `indexed.count sinkIndex=${sink.sinkIndex}`),
      first: assertFiniteUint32(shapeHeader.firstIndex, `indexed.first sinkIndex=${sink.sinkIndex}`),
      baseVertex: shapeHeader.baseVertex | 0,
      materialId: assertFiniteUint32(shapeHeader.materialClass, `materialId sinkIndex=${sink.sinkIndex}`),
    };
  }
  return {
    count: assertFiniteUint32(shapeHeader.vertexCount, `nonIndexed.count sinkIndex=${sink.sinkIndex}`),
    first: assertFiniteUint32(shapeHeader.firstVertex, `nonIndexed.first sinkIndex=${sink.sinkIndex}`),
    baseVertex: 0,
    materialId: assertFiniteUint32(shapeHeader.materialClass, `materialId sinkIndex=${sink.sinkIndex}`),
  };
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

  // [LAW:one-source-of-truth] Compiler owns sink ordering + indirect metadata.
  // Runtime packs canonical command records + static source descriptors only.
  const header = buildDrawPrepSinkTableHeader(drawPrepProgram);
  const sinkInstanceCounts: number[] = [];
  for (let sinkIndex = 0; sinkIndex < drawPrepProgram.sinks.length; sinkIndex++) {
    const instanceCount = resolveSinkInstanceCount(program, state, sinkIndex);
    sinkInstanceCounts.push(instanceCount);
  }

  const wordCount = computeDrawPrepSinkTableWordCapacity(header.totalRecordCount);
  const words = ensureTableBuffer(state, wordCount);
  words.fill(0, 0, wordCount);
  writeDrawPrepSinkTableHeader(words, header);
  const descriptorBaseWord = DRAW_PREP_SINK_TABLE_HEADER_WORDS
    + header.totalRecordCount * DRAW_PREP_SINK_TABLE_RECORD_WORDS;

  let firstInstance = 0;
  let recordWriteIndex = 0;
  for (const sinkIndex of orderedSinkIndicesByDrawMode(drawPrepProgram.sinks)) {
    const sink = drawPrepProgram.sinks[sinkIndex];
    if (!sink) {
      throw new Error(`DrawPrepSinkTablePacker: missing sink at index ${sinkIndex}`);
    }
    const renderStep = requireRenderStep(program, sink.renderStepIndex);
    const instanceCount = sinkInstanceCounts[sinkIndex] ?? 0;
    const shapeHandleWordOffset = resolveSlotShapeHandle(program, state, renderStep, instanceCount);
    assertShapeHandleInBankWindow(state, shapeHandleWordOffset, instanceCount);
    const command = resolveDrawCommandFields(state, sink, shapeHandleWordOffset);

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

    writeDrawPrepSinkRecord(words, recordWriteIndex, {
      drawMode: drawModeToCode(sink.drawMode),
      count: command.count,
      instanceCount,
      first: command.first,
      baseVertex: command.baseVertex,
      firstInstance: packedFirstInstance,
      shapeWordOffset: shapeHandleWordOffset,
      materialId: command.materialId,
    });
    const descriptorBase = descriptorBaseWord + recordWriteIndex * DRAW_PREP_SINK_DESCRIPTOR_WORDS;
    words[descriptorBase + DrawPrepSinkDescriptorWord.PositionBaseOffset] = positionAddress.baseOffset;
    words[descriptorBase + DrawPrepSinkDescriptorWord.PositionLaneStride] = positionAddress.laneStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.PositionComponentStride] = positionAddress.componentStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ColorBaseOffset] = colorAddress.baseOffset;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ColorLaneStride] = colorAddress.laneStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ColorComponentStride] = colorAddress.componentStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ScaleBaseOffset] = scaleSlotAddress.baseOffset;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ScaleLaneStride] = scaleSlotAddress.laneStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ScaleComponentStride] = scaleSlotAddress.componentStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.RotationMode] = rotationSlotAddress
      ? OPTIONAL_MODE_SLOT
      : OPTIONAL_MODE_CONSTANT;
    words[descriptorBase + DrawPrepSinkDescriptorWord.RotationBaseOffset] = rotationSlotAddress?.baseOffset ?? 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.RotationLaneStride] = rotationSlotAddress?.laneStride ?? 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.RotationComponentStride] = rotationSlotAddress?.componentStride ?? 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.RotationDefaultBits] = float32ToUint32Bits(0);
    // [LAW:single-enforcer] Canonical isotropic-scale policy is enforced at the
    // runtime sink-table boundary: deprecated scale2 descriptor lanes are pinned
    // to identity constants and never sourced from slots.
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2Mode] = OPTIONAL_MODE_CONSTANT;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2BaseOffset] = 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2LaneStride] = 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2ComponentStride] = 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2DefaultXBits] = float32ToUint32Bits(1);
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2DefaultYBits] = float32ToUint32Bits(1);

    const nextFirstInstance = packedFirstInstance + instanceCount;
    firstInstance = assertFiniteUint32(nextFirstInstance, 'firstInstancePrefixSum');
    recordWriteIndex += 1;
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
