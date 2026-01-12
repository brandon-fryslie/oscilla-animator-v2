

15) Caching policy

export interface CachingIR {
  // Per-step caching hints
  stepCache: Record<StepId, CacheKeySpec>;

  // Field materialization caching
  materializationCache: Record<string, CacheKeySpec>; // key by MaterializationIR.id
}

export type CacheKeySpec =
  | { kind: "none" }
  | { kind: "perFrame" } // recompute each frame, but allow in-frame reuse
  | { kind: "untilInvalidated"; deps: CacheDep[] };

export type CacheDep =
  | { kind: "slot"; slot: ValueSlot }
  | { kind: "bus"; busIndex: BusIndex }
  | { kind: "timeModel" }
  | { kind: "seed" }
  | { kind: "stateCell"; stateId: StateId }
  | { kind: "external"; id: string };

Critical: cache specs are part of IR so:
	•	traces can report cache hits/misses correctly
	•	Rust runtime can implement identical semantics

⸻