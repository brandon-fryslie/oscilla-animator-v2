export const GPU_PASS_STAGES = ['compute', 'vertex', 'fragment'] as const;

export type GpuPassStage = (typeof GPU_PASS_STAGES)[number];

const GPU_PASS_STAGE_SET: ReadonlySet<GpuPassStage> = new Set(GPU_PASS_STAGES);

export function isGpuPassStage(value: unknown): value is GpuPassStage {
  return typeof value === 'string' && GPU_PASS_STAGE_SET.has(value as GpuPassStage);
}
