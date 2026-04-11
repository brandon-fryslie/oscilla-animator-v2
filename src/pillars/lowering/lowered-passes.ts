import type { MemoryManifest, RosterEntry } from '../../render/rust/boundary-contract';

export interface LoweredPasses {
  readonly manifest: MemoryManifest;
  readonly rosterEntries: readonly RosterEntry[];
  readonly errors: readonly string[];
}
