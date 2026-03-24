/**
 * Domain Change Detector Service
 *
 * Tracks and logs domain count changes between recompiles.
 */

import type { RootStore } from '../stores';
import type { CompiledProgramIR } from '../compiler/ir/program';

const DOMAIN_LOG_INTERVAL_MS = 200; // Max 5 logs/sec per instance

export interface DomainChangeDetector {
  detectAndLogDomainChanges(
    store: RootStore,
    oldProgram: CompiledProgramIR | null,
    newProgram: CompiledProgramIR | null,
  ): void;
  getPrevInstanceCounts(): Map<string, number>;
  cleanup(): void;
}

/**
 * Create a domain-change detector with explicit lifecycle ownership.
 */
export function createDomainChangeDetector(
  logIntervalMs: number = DOMAIN_LOG_INTERVAL_MS,
): DomainChangeDetector {
  const prevInstanceCounts: Map<string, number> = new Map();
  const domainChangeLogThrottle = new Map<string, number>();

  function logDomainChange(
    store: RootStore,
    instanceId: string,
    oldCount: number,
    newCount: number,
    tMs: number = 0,
  ): void {
    const now = performance.now();
    const lastLog = domainChangeLogThrottle.get(instanceId) ?? 0;

    if (now - lastLog >= logIntervalMs) {
      domainChangeLogThrottle.set(instanceId, now);
    }
  }

  return {
    detectAndLogDomainChanges(
      store: RootStore,
      oldProgram: CompiledProgramIR | null,
      newProgram: CompiledProgramIR | null,
    ): void {
      if (!oldProgram?.schedule?.instances || !newProgram?.schedule?.instances) {
        return;
      }

      const oldInstances = oldProgram.schedule.instances;
      const newInstances = newProgram.schedule.instances;

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

      // Check for removed instances — clean up both tracking maps
      for (const [id] of oldInstances) {
        if (!newInstances.has(id)) {
          prevInstanceCounts.delete(id);
          domainChangeLogThrottle.delete(id);
        }
      }
    },

    getPrevInstanceCounts(): Map<string, number> {
      return prevInstanceCounts;
    },

    cleanup(): void {
      prevInstanceCounts.clear();
      domainChangeLogThrottle.clear();
    },
  };
}
