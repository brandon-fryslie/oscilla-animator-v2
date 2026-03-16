import type { CompiledProgramIR, DrawPrepSinkIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { Step, StepRender } from '../compiler/ir/types';
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

// [RECOVER-05] This packer emits static metadata only. Per-frame dynamic
// command fields (count, instanceCount, first, baseVertex, firstInstance,
// shapeWordOffset, materialId) are NOT computed by the CPU. GPU draw-prep
// compute (RECOVER-06) will derive them from canonical GPU-resident state.

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

const INSTANCE_COUNT_MODE_STATIC = 0;
const INSTANCE_COUNT_MODE_DYNAMIC = 1;

function resolveSlotArenaAddress(
  program: CompiledProgramIR,
  slot: ValueSlot,
  context: string,
): PackedArenaAddress {
  const descriptor = program.runtimeAddressTable.slotToArena.get(slot);
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

/**
 * Pack the draw-prep sink table with static metadata only.
 *
 * // [RECOVER-05] CPU no longer computes per-frame dynamic draw command fields.
 * // Record fields count/instanceCount/first/baseVertex/firstInstance/
 * // shapeWordOffset/materialId are left as zero. GPU draw-prep compute
 * // (RECOVER-06) derives these from canonical GPU-resident state.
 *
 * // [LAW:one-source-of-truth] The sink table now contains only compile-time
 * // metadata: header, per-record drawMode, and descriptor arena addresses.
 */
export function packDrawPrepSinkTableV1(
  program: CompiledProgramIR,
  arena: Float32Array,
): PackedDrawPrepSinkTableV1 | null {
  const drawPrepProgram = program.drawPrepProgram;
  // [LAW:single-enforcer] Draw-prep ABI invariants are validated at this
  // boundary even when there are no sinks to emit.
  const header = buildDrawPrepSinkTableHeader(drawPrepProgram);
  if (drawPrepProgram.sinks.length === 0) {
    return null;
  }

  const wordCount = computeDrawPrepSinkTableWordCapacity(header.totalRecordCount);
  const words = new Uint32Array(wordCount);
  writeDrawPrepSinkTableHeader(words, header);
  const descriptorBaseWord = DRAW_PREP_SINK_TABLE_HEADER_WORDS
    + header.totalRecordCount * DRAW_PREP_SINK_TABLE_RECORD_WORDS;

  let recordWriteIndex = 0;
  for (const sinkIndex of orderedSinkIndicesByDrawMode(drawPrepProgram.sinks)) {
    const sink = drawPrepProgram.sinks[sinkIndex];
    if (!sink) {
      throw new Error(`DrawPrepSinkTablePacker: missing sink at index ${sinkIndex}`);
    }
    const renderStep = requireRenderStep(program, sink.renderStepIndex);

    // [RECOVER-05] Only drawMode is written to the record. All dynamic fields
    // (count, instanceCount, first, baseVertex, firstInstance, shapeWordOffset,
    // materialId) are zero — GPU draw-prep compute owns their derivation.
    writeDrawPrepSinkRecord(words, recordWriteIndex, {
      drawMode: drawModeToCode(sink.drawMode),
      count: 0,
      instanceCount: 0,
      first: 0,
      baseVertex: 0,
      firstInstance: 0,
      shapeWordOffset: 0,
      materialId: 0,
    });

    // --- Static descriptor: arena addresses for render inputs ---
    const descriptorBase = descriptorBaseWord + recordWriteIndex * DRAW_PREP_SINK_DESCRIPTOR_WORDS;
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
    const scale2SlotAddress =
      renderStep.scale2Slot !== undefined
        ? resolveSlotArenaAddress(
          program,
          renderStep.scale2Slot,
          `scale2Slot sink(instance=${String(renderStep.instanceId)})`,
        )
        : null;

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
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2Mode] = scale2SlotAddress
      ? OPTIONAL_MODE_SLOT
      : OPTIONAL_MODE_CONSTANT;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2BaseOffset] = scale2SlotAddress?.baseOffset ?? 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2LaneStride] = scale2SlotAddress?.laneStride ?? 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2ComponentStride] = scale2SlotAddress?.componentStride ?? 0;
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2DefaultXBits] = float32ToUint32Bits(1);
    words[descriptorBase + DrawPrepSinkDescriptorWord.Scale2DefaultYBits] = float32ToUint32Bits(1);

    // --- [RECOVER-05] New static metadata for GPU draw-prep derivation ---
    const shapeSlotAddress = resolveSlotArenaAddress(
      program,
      renderStep.shape.slot,
      `shapeSlot sink(instance=${String(renderStep.instanceId)})`,
    );
    words[descriptorBase + DrawPrepSinkDescriptorWord.ShapeSlotBaseOffset] = shapeSlotAddress.baseOffset;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ShapeSlotLaneStride] = shapeSlotAddress.laneStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.ShapeSlotComponentStride] = shapeSlotAddress.componentStride;
    words[descriptorBase + DrawPrepSinkDescriptorWord.InstanceCountMode] =
      sink.instanceCountMode === 'static' ? INSTANCE_COUNT_MODE_STATIC : INSTANCE_COUNT_MODE_DYNAMIC;
    words[descriptorBase + DrawPrepSinkDescriptorWord.StaticInstanceCount] =
      sink.instanceCountMode === 'static'
        ? assertFiniteUint32(sink.staticInstanceCount ?? 0, `staticInstanceCount sinkIndex=${sink.sinkIndex}`)
        : 0;

    // [RECOVER-06] Resolve topology bank word offset from arena. After
    // materialization the shape handle (a u32 word offset into the topology
    // bank) is stored at the shape slot's arena base address.
    const shapeWordOffset = arena[shapeSlotAddress.baseOffset];
    words[descriptorBase + DrawPrepSinkDescriptorWord.ShapeWordOffset] = assertFiniteUint32(
      shapeWordOffset,
      `shapeWordOffset sinkIndex=${sink.sinkIndex}`,
    );

    recordWriteIndex += 1;
  }

  return {
    words,
    wordCount,
    header,
  };
}
