import type { DefaultSource } from '../types';

// [LAW:one-source-of-truth] UI formatting/classification for DefaultSource lives
// in one module so popovers, nodes, and inspector cannot drift.
function formatDefaultLiteralValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

export function isTimeDefaultSource(source: DefaultSource): boolean {
  return source.blockType === 'InfiniteTimeRoot';
}

type ConstLiteralDefaultSource = DefaultSource & {
  readonly blockType: 'Const';
  readonly params: {
    readonly value: unknown;
  };
};

export function isConstLiteralDefaultSource(
  source: DefaultSource | null | undefined
): source is ConstLiteralDefaultSource {
  return Boolean(source && source.blockType === 'Const' && source.params?.value !== undefined);
}

export function formatDefaultSourceReference(source: DefaultSource): string {
  if (isConstLiteralDefaultSource(source)) {
    return formatDefaultLiteralValue(source.params.value);
  }
  return `${source.blockType}.${source.output}`;
}

export function formatDefaultSourceLabel(source: DefaultSource, prefix?: string): string {
  const base = formatDefaultSourceReference(source);
  return prefix ? `${prefix}${base}` : base;
}
