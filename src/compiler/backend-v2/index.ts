/**
 * C1 Compiler Backend — Entry Point
 *
 * Compiles FrontendResult into PipelineInstallPayload via 5 phases:
 * 1. Topological sort
 * 2. Manifest harvesting
 * 3. Sink discovery
 * 4. Lowering & fusion
 * 5. Roster assembly
 */

import type { FrontendResult } from '../frontend';
import type { NormalizedPatch } from '../ir/NormalizedPatch';
import type { PortKey } from '../ir/patches';
import type { CanonicalType } from '../../core/canonical-types';
import type { C1CompileResult } from './types';
import { topoSort } from './topo-sort';
import { harvest } from './harvester';
import { discoverSinks } from './sink-discovery';
import { lowerAndFuse } from './lowering';
import { assembleRoster } from './roster-assembly';

// Import all C1 block registrations
import '../../blocks-v2/all';

export type { C1CompileResult } from './types';

/**
 * Compile from FrontendResult (full pipeline with frontend).
 */
export function compileC1(frontend: FrontendResult): C1CompileResult {
  if (!frontend.backendReady) {
    const msgs = frontend.errors.map(e =>
      typeof e === 'string' ? e : (e as { message?: string }).message ?? JSON.stringify(e)
    );
    return { kind: 'error', errors: [`Frontend not ready: ${msgs.join('; ')}`] };
  }

  return compileC1FromNormalized(frontend.normalizedPatch, frontend.typedPatch.portTypes);
}

/**
 * Compile from a NormalizedPatch directly (bypasses frontend).
 * Used by the compiler tester to build graph fixtures without needing
 * the full V1 block registry and type inference pipeline.
 */
export function compileC1FromNormalized(
  patch: NormalizedPatch,
  portTypes?: ReadonlyMap<PortKey, CanonicalType>,
): C1CompileResult {
  const types = portTypes ?? new Map<PortKey, CanonicalType>();

  try {
    // Phase 1: Topological sort
    const topoOrder = topoSort(patch);

    // Phase 2: Harvest manifest
    const manifest = harvest(topoOrder, patch, types);

    // Phase 3: Discover sinks
    const sinks = discoverSinks(topoOrder, patch);
    if (sinks.length === 0) {
      return { kind: 'error', errors: ['[C1] No sink blocks found in graph'] };
    }

    // Phase 4: Lower & fuse
    const { passes, errors: lowerErrors } = lowerAndFuse(
      sinks, patch, types, manifest,
    );
    if (lowerErrors.length > 0) {
      return { kind: 'error', errors: lowerErrors };
    }

    // Phase 5: Assemble roster
    const payload = assembleRoster(manifest, passes);

    return { kind: 'ok', payload };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: 'error', errors: [msg] };
  }
}
