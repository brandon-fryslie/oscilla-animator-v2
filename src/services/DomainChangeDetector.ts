/**
 * Domain Change Detector Service
 *
 * Tracks and logs domain count changes between recompiles.
 * Integrates with ContinuityStore for UI display.
 */

import type { RootStore } from '../stores';

/** Track previous instance counts for domain change detection */
const prevInstanceCounts: Map<string, number> = new Map();

/** Throttle state for domain change logging */
const domainChangeLogThrottle = new Map<string, number>();
const DOMAIN_LOG_INTERVAL_MS = 200; // Max 5 logs/sec per instance

/**
 * Log domain change if not throttled.
 * Also records to ContinuityStore for UI display.
 */
function logDomainChange(
  store: RootStore,
  instanceId: string,
  oldCount: number,
  newCount: number,
  tMs: number = 0
) {
  const now = performance.now();
  const lastLog = domainChangeLogThrottle.get(instanceId) ?? 0;

  if (now - lastLog >= DOMAIN_LOG_INTERVAL_MS) {
    // Record to ContinuityStore for UI
    store.continuity.recordDomainChange(
      instanceId,
      oldCount,
      newCount,
      tMs || now
    );

    domainChangeLogThrottle.set(instanceId, now);
  }
}

/**
 * Detect domain changes by comparing old/new instance counts
 */
export function detectAndLogDomainChanges(
  store: RootStore,
  oldProgram: any,
  newProgram: any
): void {
  if (!oldProgram?.schedule?.instances || !newProgram?.schedule?.instances) {
    return;
  }

  const oldInstances = oldProgram.schedule.instances as Map<string, { count: number }>;
  const newInstances = newProgram.schedule.instances as Map<string, { count: number }>;

  // Check for changes in existing instances
  for (const [id, newDecl] of newInstances) {
    const oldCount = prevInstanceCounts.get(id) ?? 0;
    const newCount = typeof newDecl.count === 'number' ? newDecl.count : 0;

    if (oldCount !== newCount && oldCount > 0) {
      logDomainChange(store, id, oldCount, newCount);
    }

    // Update tracking
    prevInstanceCounts.set(id, newCount);
  }

  // Check for removed instances
  for (const [id, _oldDecl] of oldInstances) {
    if (!newInstances.has(id)) {
      prevInstanceCounts.delete(id);
    }
  }
}

/**
 * Get the current instance counts map (for CompileOrchestrator initialization)
 */
export function getPrevInstanceCounts(): Map<string, number> {
  return prevInstanceCounts;
}
