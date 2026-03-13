export const GPU_PASS_STAGES = ['compute', 'vertex', 'fragment'] as const;

export type GpuPassStage = (typeof GPU_PASS_STAGES)[number];

// [LAW:one-source-of-truth] Stage -> entry annotation mapping is canonicalized
// once so compiler/service/renderer validation cannot drift.
const GPU_PASS_STAGE_ENTRY_ANNOTATION: Readonly<Record<GpuPassStage, string>> = Object.freeze({
  compute: '@compute',
  vertex: '@vertex',
  fragment: '@fragment',
});

const GPU_PASS_STAGE_SET: ReadonlySet<GpuPassStage> = new Set(GPU_PASS_STAGES);

export function isGpuPassStage(value: unknown): value is GpuPassStage {
  return typeof value === 'string' && GPU_PASS_STAGE_SET.has(value as GpuPassStage);
}

export function requiredEntryAnnotationForGpuPassStage(stage: GpuPassStage): string {
  return GPU_PASS_STAGE_ENTRY_ANNOTATION[stage];
}
