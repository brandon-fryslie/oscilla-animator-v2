import type { DrawPrepProgramIR, DrawPrepSinkIR } from '../compiler/ir/program';

// [LAW:one-source-of-truth] Draw-prep sink-table wire format is declared once
// here so runtime packing, worker transport, and Rust execution share one ABI.
export const DRAW_PREP_SINK_TABLE_V1_VERSION = 1;
export const DRAW_PREP_SINK_TABLE_HEADER_WORDS = 8;
export const DRAW_PREP_SINK_TABLE_RECORD_WORDS = 8;
export const DRAW_PREP_SINK_DESCRIPTOR_WORDS = 31;

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
  DrawMode = 0,
  Count = 1,
  InstanceCount = 2,
  First = 3,
  BaseVertex = 4,
  FirstInstance = 5,
  ShapeWordOffset = 6,
  MaterialId = 7,
}

// [LAW:one-source-of-truth] Sink descriptor schema is defined once so JS packers
// and Rust assembly shader share one canonical static-address contract.
export enum DrawPrepSinkDescriptorWord {
  PositionBaseOffset = 0,
  PositionLaneStride = 1,
  PositionComponentStride = 2,
  ColorBaseOffset = 3,
  ColorLaneStride = 4,
  ColorComponentStride = 5,
  ScaleBaseOffset = 6,
  ScaleLaneStride = 7,
  ScaleComponentStride = 8,
  RotationMode = 9,
  RotationBaseOffset = 10,
  RotationLaneStride = 11,
  RotationComponentStride = 12,
  RotationDefaultBits = 13,
  Scale2Mode = 14,
  Scale2BaseOffset = 15,
  Scale2LaneStride = 16,
  Scale2ComponentStride = 17,
  Scale2DefaultXBits = 18,
  Scale2DefaultYBits = 19,
  // [RECOVER-05] Shape-slot address and instance-count metadata for GPU
  // draw-prep derivation in RECOVER-06.
  ShapeSlotBaseOffset = 20,
  ShapeSlotLaneStride = 21,
  ShapeSlotComponentStride = 22,
  InstanceCountMode = 23,
  StaticInstanceCount = 24,
  // [RECOVER-06] Topology bank word offset resolved from arena at pack time.
  // GPU draw-prep and assembly shaders use this to read ShapeHeaderV1.
  ShapeWordOffset = 25,
  // Position Z (optional per-instance depth for 2.5D ordering)
  PositionZMode = 26,
  PositionZBaseOffset = 27,
  PositionZLaneStride = 28,
  PositionZComponentStride = 29,
  PositionZDefaultBits = 30,
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
  readonly drawMode: DrawPrepDrawModeCode;
  readonly count: number;
  readonly instanceCount: number;
  readonly first: number;
  readonly baseVertex: number;
  readonly firstInstance: number;
  readonly shapeWordOffset: number;
  readonly materialId: number;
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

function assertFiniteInt32(value: number, context: string): number {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || !Number.isSafeInteger(value)
    || value < -0x8000_0000
    || value > 0x7FFF_FFFF
  ) {
    throw new Error(`DrawPrepSinkTable: ${context} must be int32, got ${String(value)}`);
  }
  return value;
}

export function computeDrawPrepSinkTableWordCapacity(recordCount: number): number {
  const safeRecordCount = assertFiniteUint32(recordCount, 'recordCount');
  return DRAW_PREP_SINK_TABLE_HEADER_WORDS
    + safeRecordCount * DRAW_PREP_SINK_TABLE_RECORD_WORDS
    + safeRecordCount * DRAW_PREP_SINK_DESCRIPTOR_WORDS;
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

  target[base + DrawPrepSinkTableRecordWord.DrawMode] = assertFiniteUint32(record.drawMode, 'record.drawMode');
  target[base + DrawPrepSinkTableRecordWord.Count] = assertFiniteUint32(record.count, 'record.count');
  target[base + DrawPrepSinkTableRecordWord.InstanceCount] = assertFiniteUint32(
    record.instanceCount,
    'record.instanceCount',
  );
  target[base + DrawPrepSinkTableRecordWord.First] = assertFiniteUint32(record.first, 'record.first');
  target[base + DrawPrepSinkTableRecordWord.FirstInstance] = assertFiniteUint32(
    record.firstInstance,
    'record.firstInstance',
  );
  target[base + DrawPrepSinkTableRecordWord.ShapeWordOffset] = assertFiniteUint32(
    record.shapeWordOffset,
    'record.shapeWordOffset',
  );
  target[base + DrawPrepSinkTableRecordWord.MaterialId] = assertFiniteUint32(
    record.materialId,
    'record.materialId',
  );

  const dataView = new DataView(target.buffer, target.byteOffset, target.byteLength);
  dataView.setInt32(
    (base + DrawPrepSinkTableRecordWord.BaseVertex) * 4,
    assertFiniteInt32(record.baseVertex, 'record.baseVertex'),
    true,
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
