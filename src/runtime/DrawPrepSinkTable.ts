import type { DrawPrepProgramIR, DrawPrepSinkIR } from '../compiler/ir/program';

// [LAW:one-source-of-truth] Draw-prep sink-table wire format is declared once
// here so runtime packing, worker transport, and Rust execution share one ABI.
export const DRAW_PREP_SINK_TABLE_V1_VERSION = 1;
export const DRAW_PREP_SINK_TABLE_HEADER_WORDS = 8;
export const DRAW_PREP_SINK_TABLE_RECORD_WORDS = 29;

export type DrawPrepDrawModeCode = 0 | 1;

export enum DrawPrepSinkTableHeaderWord {
  Version = 0,
  TotalRecordCount = 1,
  IndexedRecordCount = 2,
  NonIndexedRecordCount = 3,
  IndexedRegionBaseWords = 4,
  NonIndexedRegionBaseWords = 5,
  IndexedStrideWords = 6,
  NonIndexedStrideWords = 7,
}

export enum DrawPrepSinkTableRecordWord {
  SinkIndex = 0,
  DrawMode = 1,
  ShapeHandleWordOffset = 2,
  IndirectRecordIndex = 3,
  InstanceCount = 4,
  FirstInstance = 5,
  RenderStepIndex = 6,
  ShapeSourceCode = 7,
  PositionBaseOffset = 8,
  PositionLaneStride = 9,
  PositionComponentStride = 10,
  ColorBaseOffset = 11,
  ColorLaneStride = 12,
  ColorComponentStride = 13,
  ScaleModeCode = 14,
  ScaleValueOrBaseOffset = 15,
  ScaleLaneStride = 16,
  ScaleComponentStride = 17,
  RotationModeCode = 18,
  RotationBaseOffset = 19,
  RotationLaneStride = 20,
  RotationComponentStride = 21,
  Scale2ModeCode = 22,
  Scale2BaseOffset = 23,
  Scale2LaneStride = 24,
  Scale2ComponentStride = 25,
  ShapeSlotBaseOffset = 26,
  ShapeSlotLaneStride = 27,
  ShapeSlotComponentStride = 28,
}

export interface DrawPrepSinkTableHeaderV1 {
  readonly version: number;
  readonly totalRecordCount: number;
  readonly indexedRecordCount: number;
  readonly nonIndexedRecordCount: number;
  readonly indexedRegionBaseWords: number;
  readonly nonIndexedRegionBaseWords: number;
  readonly indexedStrideWords: number;
  readonly nonIndexedStrideWords: number;
}

export interface DrawPrepSinkRecordV1 {
  readonly sinkIndex: number;
  readonly drawMode: DrawPrepDrawModeCode;
  readonly shapeHandleWordOffset: number;
  readonly indirectRecordIndex: number;
  readonly instanceCount: number;
  readonly firstInstance: number;
  readonly renderStepIndex: number;
  readonly shapeSourceCode: number;
  readonly positionBaseOffset: number;
  readonly positionLaneStride: number;
  readonly positionComponentStride: number;
  readonly colorBaseOffset: number;
  readonly colorLaneStride: number;
  readonly colorComponentStride: number;
  readonly scaleModeCode: number;
  readonly scaleValueOrBaseOffset: number;
  readonly scaleLaneStride: number;
  readonly scaleComponentStride: number;
  readonly rotationModeCode: number;
  readonly rotationBaseOffset: number;
  readonly rotationLaneStride: number;
  readonly rotationComponentStride: number;
  readonly scale2ModeCode: number;
  readonly scale2BaseOffset: number;
  readonly scale2LaneStride: number;
  readonly scale2ComponentStride: number;
  readonly shapeSlotBaseOffset: number;
  readonly shapeSlotLaneStride: number;
  readonly shapeSlotComponentStride: number;
}

export interface DrawPrepSinkTableV1 {
  readonly header: DrawPrepSinkTableHeaderV1;
  readonly records: readonly DrawPrepSinkRecordV1[];
}

export function drawModeToCode(drawMode: DrawPrepSinkIR['drawMode']): DrawPrepDrawModeCode {
  return drawMode === 'indexed' ? 0 : 1;
}

export function codeToDrawMode(drawMode: number): DrawPrepSinkIR['drawMode'] {
  if (drawMode === 0) {
    return 'indexed';
  }
  if (drawMode === 1) {
    return 'nonIndexed';
  }
  throw new Error(`DrawPrepSinkTable: invalid draw mode code ${String(drawMode)}`);
}

function assertFiniteUint32(value: number, context: string): number {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || !Number.isSafeInteger(value)
    || value < 0
    || value > 0xFFFF_FFFF
  ) {
    throw new Error(`DrawPrepSinkTable: ${context} must be uint32, got ${String(value)}`);
  }
  return value;
}

export function computeDrawPrepSinkTableWordCapacity(recordCount: number): number {
  const safeRecordCount = assertFiniteUint32(recordCount, 'recordCount');
  return DRAW_PREP_SINK_TABLE_HEADER_WORDS + safeRecordCount * DRAW_PREP_SINK_TABLE_RECORD_WORDS;
}

export function buildDrawPrepSinkTableHeader(program: DrawPrepProgramIR): DrawPrepSinkTableHeaderV1 {
  const totalFromRegions = program.indexedRecordCount + program.nonIndexedRecordCount;
  if (totalFromRegions !== program.totalRecordCount) {
    throw new Error(
      'DrawPrepSinkTable: drawPrepProgram totalRecordCount mismatch ' +
        `(totalRecordCount=${program.totalRecordCount}, regions=${totalFromRegions})`,
    );
  }
  if (program.sinks.length !== program.totalRecordCount) {
    throw new Error(
      'DrawPrepSinkTable: drawPrepProgram sink length mismatch ' +
        `(sinks=${program.sinks.length}, totalRecordCount=${program.totalRecordCount})`,
    );
  }

  return {
    version: DRAW_PREP_SINK_TABLE_V1_VERSION,
    totalRecordCount: assertFiniteUint32(program.totalRecordCount, 'totalRecordCount'),
    indexedRecordCount: assertFiniteUint32(program.indexedRecordCount, 'indexedRecordCount'),
    nonIndexedRecordCount: assertFiniteUint32(program.nonIndexedRecordCount, 'nonIndexedRecordCount'),
    indexedRegionBaseWords: assertFiniteUint32(program.indexedRegionBaseWords, 'indexedRegionBaseWords'),
    nonIndexedRegionBaseWords: assertFiniteUint32(program.nonIndexedRegionBaseWords, 'nonIndexedRegionBaseWords'),
    indexedStrideWords: assertFiniteUint32(program.indexedStrideWords, 'indexedStrideWords'),
    nonIndexedStrideWords: assertFiniteUint32(program.nonIndexedStrideWords, 'nonIndexedStrideWords'),
  };
}

export function writeDrawPrepSinkTableHeader(target: Uint32Array, header: DrawPrepSinkTableHeaderV1): void {
  if (target.length < DRAW_PREP_SINK_TABLE_HEADER_WORDS) {
    throw new Error(
      `DrawPrepSinkTable: target length ${target.length} is smaller than header ${DRAW_PREP_SINK_TABLE_HEADER_WORDS}`,
    );
  }
  target[DrawPrepSinkTableHeaderWord.Version] = assertFiniteUint32(header.version, 'header.version');
  target[DrawPrepSinkTableHeaderWord.TotalRecordCount] = assertFiniteUint32(
    header.totalRecordCount,
    'header.totalRecordCount',
  );
  target[DrawPrepSinkTableHeaderWord.IndexedRecordCount] = assertFiniteUint32(
    header.indexedRecordCount,
    'header.indexedRecordCount',
  );
  target[DrawPrepSinkTableHeaderWord.NonIndexedRecordCount] = assertFiniteUint32(
    header.nonIndexedRecordCount,
    'header.nonIndexedRecordCount',
  );
  target[DrawPrepSinkTableHeaderWord.IndexedRegionBaseWords] = assertFiniteUint32(
    header.indexedRegionBaseWords,
    'header.indexedRegionBaseWords',
  );
  target[DrawPrepSinkTableHeaderWord.NonIndexedRegionBaseWords] = assertFiniteUint32(
    header.nonIndexedRegionBaseWords,
    'header.nonIndexedRegionBaseWords',
  );
  target[DrawPrepSinkTableHeaderWord.IndexedStrideWords] = assertFiniteUint32(
    header.indexedStrideWords,
    'header.indexedStrideWords',
  );
  target[DrawPrepSinkTableHeaderWord.NonIndexedStrideWords] = assertFiniteUint32(
    header.nonIndexedStrideWords,
    'header.nonIndexedStrideWords',
  );
}

export function writeDrawPrepSinkRecord(
  target: Uint32Array,
  recordIndex: number,
  record: DrawPrepSinkRecordV1,
): void {
  const safeRecordIndex = assertFiniteUint32(recordIndex, 'recordIndex');
  const base = DRAW_PREP_SINK_TABLE_HEADER_WORDS + safeRecordIndex * DRAW_PREP_SINK_TABLE_RECORD_WORDS;
  if (base + DRAW_PREP_SINK_TABLE_RECORD_WORDS > target.length) {
    throw new Error(
      'DrawPrepSinkTable: target capacity exceeded ' +
        `(recordIndex=${safeRecordIndex}, base=${base}, targetLength=${target.length})`,
    );
  }

  target[base + DrawPrepSinkTableRecordWord.SinkIndex] = assertFiniteUint32(record.sinkIndex, 'record.sinkIndex');
  target[base + DrawPrepSinkTableRecordWord.DrawMode] = assertFiniteUint32(record.drawMode, 'record.drawMode');
  target[base + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset] = assertFiniteUint32(
    record.shapeHandleWordOffset,
    'record.shapeHandleWordOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.IndirectRecordIndex] = assertFiniteUint32(
    record.indirectRecordIndex,
    'record.indirectRecordIndex',
  );
  target[base + DrawPrepSinkTableRecordWord.InstanceCount] = assertFiniteUint32(
    record.instanceCount,
    'record.instanceCount',
  );
  target[base + DrawPrepSinkTableRecordWord.FirstInstance] = assertFiniteUint32(
    record.firstInstance,
    'record.firstInstance',
  );
  target[base + DrawPrepSinkTableRecordWord.RenderStepIndex] = assertFiniteUint32(
    record.renderStepIndex,
    'record.renderStepIndex',
  );
  target[base + DrawPrepSinkTableRecordWord.ShapeSourceCode] = assertFiniteUint32(
    record.shapeSourceCode,
    'record.shapeSourceCode',
  );
  target[base + DrawPrepSinkTableRecordWord.PositionBaseOffset] = assertFiniteUint32(
    record.positionBaseOffset,
    'record.positionBaseOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.PositionLaneStride] = assertFiniteUint32(
    record.positionLaneStride,
    'record.positionLaneStride',
  );
  target[base + DrawPrepSinkTableRecordWord.PositionComponentStride] = assertFiniteUint32(
    record.positionComponentStride,
    'record.positionComponentStride',
  );
  target[base + DrawPrepSinkTableRecordWord.ColorBaseOffset] = assertFiniteUint32(
    record.colorBaseOffset,
    'record.colorBaseOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.ColorLaneStride] = assertFiniteUint32(
    record.colorLaneStride,
    'record.colorLaneStride',
  );
  target[base + DrawPrepSinkTableRecordWord.ColorComponentStride] = assertFiniteUint32(
    record.colorComponentStride,
    'record.colorComponentStride',
  );
  target[base + DrawPrepSinkTableRecordWord.ScaleModeCode] = assertFiniteUint32(
    record.scaleModeCode,
    'record.scaleModeCode',
  );
  target[base + DrawPrepSinkTableRecordWord.ScaleValueOrBaseOffset] = assertFiniteUint32(
    record.scaleValueOrBaseOffset,
    'record.scaleValueOrBaseOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.ScaleLaneStride] = assertFiniteUint32(
    record.scaleLaneStride,
    'record.scaleLaneStride',
  );
  target[base + DrawPrepSinkTableRecordWord.ScaleComponentStride] = assertFiniteUint32(
    record.scaleComponentStride,
    'record.scaleComponentStride',
  );
  target[base + DrawPrepSinkTableRecordWord.RotationModeCode] = assertFiniteUint32(
    record.rotationModeCode,
    'record.rotationModeCode',
  );
  target[base + DrawPrepSinkTableRecordWord.RotationBaseOffset] = assertFiniteUint32(
    record.rotationBaseOffset,
    'record.rotationBaseOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.RotationLaneStride] = assertFiniteUint32(
    record.rotationLaneStride,
    'record.rotationLaneStride',
  );
  target[base + DrawPrepSinkTableRecordWord.RotationComponentStride] = assertFiniteUint32(
    record.rotationComponentStride,
    'record.rotationComponentStride',
  );
  target[base + DrawPrepSinkTableRecordWord.Scale2ModeCode] = assertFiniteUint32(
    record.scale2ModeCode,
    'record.scale2ModeCode',
  );
  target[base + DrawPrepSinkTableRecordWord.Scale2BaseOffset] = assertFiniteUint32(
    record.scale2BaseOffset,
    'record.scale2BaseOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.Scale2LaneStride] = assertFiniteUint32(
    record.scale2LaneStride,
    'record.scale2LaneStride',
  );
  target[base + DrawPrepSinkTableRecordWord.Scale2ComponentStride] = assertFiniteUint32(
    record.scale2ComponentStride,
    'record.scale2ComponentStride',
  );
  target[base + DrawPrepSinkTableRecordWord.ShapeSlotBaseOffset] = assertFiniteUint32(
    record.shapeSlotBaseOffset,
    'record.shapeSlotBaseOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.ShapeSlotLaneStride] = assertFiniteUint32(
    record.shapeSlotLaneStride,
    'record.shapeSlotLaneStride',
  );
  target[base + DrawPrepSinkTableRecordWord.ShapeSlotComponentStride] = assertFiniteUint32(
    record.shapeSlotComponentStride,
    'record.shapeSlotComponentStride',
  );
}

export function readDrawPrepSinkTableHeader(source: Uint32Array): DrawPrepSinkTableHeaderV1 {
  if (source.length < DRAW_PREP_SINK_TABLE_HEADER_WORDS) {
    throw new Error(
      `DrawPrepSinkTable: source length ${source.length} is smaller than header ${DRAW_PREP_SINK_TABLE_HEADER_WORDS}`,
    );
  }
  return {
    version: source[DrawPrepSinkTableHeaderWord.Version] >>> 0,
    totalRecordCount: source[DrawPrepSinkTableHeaderWord.TotalRecordCount] >>> 0,
    indexedRecordCount: source[DrawPrepSinkTableHeaderWord.IndexedRecordCount] >>> 0,
    nonIndexedRecordCount: source[DrawPrepSinkTableHeaderWord.NonIndexedRecordCount] >>> 0,
    indexedRegionBaseWords: source[DrawPrepSinkTableHeaderWord.IndexedRegionBaseWords] >>> 0,
    nonIndexedRegionBaseWords: source[DrawPrepSinkTableHeaderWord.NonIndexedRegionBaseWords] >>> 0,
    indexedStrideWords: source[DrawPrepSinkTableHeaderWord.IndexedStrideWords] >>> 0,
    nonIndexedStrideWords: source[DrawPrepSinkTableHeaderWord.NonIndexedStrideWords] >>> 0,
  };
}
