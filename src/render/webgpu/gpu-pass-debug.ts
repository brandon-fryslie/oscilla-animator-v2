function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function previewWgsl(wgsl: string, maxLines: number = 4): string {
  return wgsl
    .split('\n')
    .slice(0, maxLines)
    .map((line) => line.trim())
    .join(' | ');
}

export function formatWgslWithLineNumbers(wgsl: string): string {
  return wgsl
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');
}

export function hashWgslSource(wgsl: string): string {
  // FNV-1a hash for compact runtime console payload correlation.
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < wgsl.length; index++) {
    hash ^= wgsl.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function parseWgslU32Constant(wgsl: string, name: string): number | null {
  const pattern = new RegExp(`const\\s+${escapeRegex(name)}\\s*:\\s*u32\\s*=\\s*(\\d+)u\\s*;`);
  const match = wgsl.match(pattern);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractPassDebugConstants(wgsl: string): Record<string, number> {
  const keys = [
    'ACTIVE_LANES',
    'GRID_WIDTH',
    'GRID_HEIGHT',
    'CP_OFFSET',
    'CP_LANE_STRIDE',
    'CP_COMPONENT_STRIDE',
    'COLOR_OFFSET',
    'COLOR_LANE_STRIDE',
    'COLOR_COMPONENT_STRIDE',
    'SCALE_OFFSET',
    'SCALE_LANE_STRIDE',
    'SCALE_COMPONENT_STRIDE',
  ] as const;

  const constants: Record<string, number> = {};
  for (const key of keys) {
    const value = parseWgslU32Constant(wgsl, key);
    if (value !== null) {
      constants[key] = value;
    }
  }
  return constants;
}
