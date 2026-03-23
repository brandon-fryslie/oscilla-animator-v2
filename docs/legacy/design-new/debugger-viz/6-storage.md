Option 2 (separate, demand-driven HistoryService), with one important refinement: the ring buffers are keyed by DebugTargetKey (semantic edge/port), and are rebound to the current ValueSlot on each compile/mapping rebuild.

Reasons, both sides:

Why Option 2 is the right default
	•	Correctness with unstable slots: you already established ValueSlot is not stable across recompiles. If you “always run for all mapped slots” (Option 1) you’ll either (a) wipe on recompile and lose continuity, or (b) accidentally attach history to a different semantic value after recompile unless you build an extra rebinding layer—at which point you’ve reinvented Option 2.
	•	Bounded work: debug mode should not impose a per-frame cost proportional to “all slots” unless you explicitly want “always-on telemetry.” Demand-driven keeps frame cost proportional to what the UI is actually inspecting.
	•	Extends cleanly: the same mechanism can later support pinned probes, multiple views, and “record this for 10 seconds” without changing DebugService.

Why Option 1 can still be justified (and when)
	•	If you want instant hover history even for values the user has never hovered before (no warm-up), then Option 1 gives that.
	•	If your slot count is truly small and stable, Option 1 is simpler.

The refinement that makes Option 2 not annoying

You don’t want “no history unless already watching” to degrade UX. Fix that by having the HistoryService start tracking immediately on hover and show a warm-up indicator until it has N samples (e.g. history: 12/64). That stays explicit and truthful.

Canonical placement decision
	•	DebugService remains the authoritative snapshot store for “current value,” slot/type metadata, and the DebugTargetKey -> ValueSlot mapping.
	•	HistoryService owns temporal buffers (ring buffers), keyed by DebugTargetKey, and uses the mapping to pull samples at update time.
	•	On recompile/mapping rebuild: HistoryService rebinds each tracked key to its new slot (or pauses tracking if the key no longer resolves), without discarding the existing ring unless you explicitly clear debug state.

