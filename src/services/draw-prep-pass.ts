export const DRAW_PREP_PASS_ID = 'draw.prep' as const;
export const DRAW_PREP_ENTRY_POINT = 'main' as const;

export const DRAW_PREP_WGSL_SOURCE = `
const DRAW_MODE_INDEXED: u32 = 0u;
const DRAW_MODE_NON_INDEXED: u32 = 1u;
const SINK_TABLE_HEADER_WORDS: u32 = 8u;
const SINK_TABLE_RECORD_WORDS: u32 = 8u;
const DEFAULT_INDEXED_STRIDE_WORDS: u32 = 5u;
const DEFAULT_NON_INDEXED_STRIDE_WORDS: u32 = 4u;

const TABLE_WORD_TOTAL_RECORD_COUNT: u32 = 1u;
const TABLE_WORD_INDEXED_COUNT: u32 = 2u;
const TABLE_WORD_INDEXED_REGION_BASE_WORDS: u32 = 4u;
const TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS: u32 = 5u;
const TABLE_WORD_INDEXED_STRIDE_WORDS: u32 = 6u;
const TABLE_WORD_NON_INDEXED_STRIDE_WORDS: u32 = 7u;

const RECORD_WORD_DRAW_MODE: u32 = 0u;
const RECORD_WORD_COUNT: u32 = 1u;
const RECORD_WORD_INSTANCE_COUNT: u32 = 2u;
const RECORD_WORD_FIRST: u32 = 3u;
const RECORD_WORD_BASE_VERTEX: u32 = 4u;
const RECORD_WORD_FIRST_INSTANCE: u32 = 5u;

@group(0) @binding(0) var<storage, read> sinkTableWords: array<u32>;
@group(0) @binding(2) var<storage, read_write> indirectWords: array<atomic<u32>>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (arrayLength(&sinkTableWords) < SINK_TABLE_HEADER_WORDS) {
    return;
  }

  let totalRecordCount = sinkTableWords[TABLE_WORD_TOTAL_RECORD_COUNT];
  let recordIndex = gid.x;
  if (recordIndex >= totalRecordCount) {
    return;
  }

  let recordBase = SINK_TABLE_HEADER_WORDS + recordIndex * SINK_TABLE_RECORD_WORDS;
  if (recordBase + RECORD_WORD_FIRST_INSTANCE >= arrayLength(&sinkTableWords)) {
    return;
  }

  let drawMode = sinkTableWords[recordBase + RECORD_WORD_DRAW_MODE];
  let count = sinkTableWords[recordBase + RECORD_WORD_COUNT];
  let instanceCount = sinkTableWords[recordBase + RECORD_WORD_INSTANCE_COUNT];
  let first = sinkTableWords[recordBase + RECORD_WORD_FIRST];
  let baseVertex = sinkTableWords[recordBase + RECORD_WORD_BASE_VERTEX];
  let firstInstance = sinkTableWords[recordBase + RECORD_WORD_FIRST_INSTANCE];
  let indexedRecordCount = sinkTableWords[TABLE_WORD_INDEXED_COUNT];
  let indexedRegionBaseWords = sinkTableWords[TABLE_WORD_INDEXED_REGION_BASE_WORDS];
  let nonIndexedRegionBaseWords = sinkTableWords[TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS];
  let indexedStrideWords = max(sinkTableWords[TABLE_WORD_INDEXED_STRIDE_WORDS], DEFAULT_INDEXED_STRIDE_WORDS);
  let nonIndexedStrideWords = max(sinkTableWords[TABLE_WORD_NON_INDEXED_STRIDE_WORDS], DEFAULT_NON_INDEXED_STRIDE_WORDS);

  if (drawMode == DRAW_MODE_INDEXED) {
    if (recordIndex >= indexedRecordCount) {
      return;
    }
    let base = indexedRegionBaseWords + recordIndex * indexedStrideWords;
    if (base + 4u >= arrayLength(&indirectWords)) {
      return;
    }
    atomicStore(&indirectWords[base + 0u], count);
    atomicAdd(&indirectWords[base + 1u], instanceCount);
    atomicStore(&indirectWords[base + 2u], first);
    atomicStore(&indirectWords[base + 3u], baseVertex);
    atomicStore(&indirectWords[base + 4u], firstInstance);
    return;
  }

  if (drawMode != DRAW_MODE_NON_INDEXED || recordIndex < indexedRecordCount) {
    return;
  }
  let nonIndexedRecordIndex = recordIndex - indexedRecordCount;
  let base = nonIndexedRegionBaseWords + nonIndexedRecordIndex * nonIndexedStrideWords;
  if (base + 3u >= arrayLength(&indirectWords)) {
    return;
  }
  atomicStore(&indirectWords[base + 0u], count);
  atomicAdd(&indirectWords[base + 1u], instanceCount);
  atomicStore(&indirectWords[base + 2u], first);
  atomicStore(&indirectWords[base + 3u], firstInstance);
}
`.trim();
