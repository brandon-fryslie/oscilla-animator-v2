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

// [LAW:single-enforcer] Exact token match for WGSL stage annotations.
// Substring includes('@compute') would false-positive on '@compute_size'.
const WGSL_ATTRIBUTE_TOKEN_PATTERN = /@[\w:]+/g;

export function hasExactAnnotation(attributeText: string, annotation: string): boolean {
  const tokens: string[] = attributeText.match(WGSL_ATTRIBUTE_TOKEN_PATTERN) ?? [];
  return tokens.includes(annotation);
}
