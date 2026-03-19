export type DebugMiniViewCardinalityKind = 'zero' | 'one' | 'many' | null;
export type DebugMiniViewDisplayMode = 'scalar' | 'field' | 'unavailable';

export function getDebugMiniViewDisplayMode(
  cardinality: DebugMiniViewCardinalityKind,
): DebugMiniViewDisplayMode {
  if (cardinality === 'many') {
    return 'field';
  }
  if (cardinality === 'one' || cardinality === 'zero') {
    return 'scalar';
  }
  return 'unavailable';
}
