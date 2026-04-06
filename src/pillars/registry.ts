/**
 * src/pillars/registry.ts
 *
 * Pillar block registry. Blocks register at module load via side-effect
 * imports in src/pillars/blocks/index.ts.
 *
 * [LAW:single-enforcer] This is the only module that holds block definitions.
 * Lookups must go through `getPillarBlock`.
 */

import type { PillarBlockDef } from './types';

const REGISTRY = new Map<string, PillarBlockDef>();

/**
 * Register a pillar block definition at module load time.
 * Throws on duplicate registration — the registry is append-only and
 * duplicate type names are a bug.
 */
export function registerPillarBlock(type: string, def: PillarBlockDef): void {
  if (REGISTRY.has(type)) {
    throw new Error(`[pillars] Duplicate block registration: '${type}'`);
  }
  REGISTRY.set(type, def);
}

/**
 * Look up a pillar block definition by type string.
 * Returns undefined for unknown types so callers can produce better error
 * messages than a thrown exception.
 */
export function getPillarBlock(type: string): PillarBlockDef | undefined {
  return REGISTRY.get(type);
}

/**
 * Diagnostic helper: list every registered block type. Used by tests and
 * debug tooling.
 */
export function getRegisteredPillarTypes(): readonly string[] {
  return [...REGISTRY.keys()];
}
