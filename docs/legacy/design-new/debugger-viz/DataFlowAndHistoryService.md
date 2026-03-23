This is close, but I would change one core mechanism and tighten two type/perf details.

1) Don’t poll — push from DebugService (event/tap-driven)

Polling “each frame for each tracked key” is the wrong cost shape. You already have the exact moment values change: DebugService.updateSlotValue(slotId, value).

Canonical rule:
•	HistoryService is fed by DebugService writes, not by polling.
•	HistoryService maintains slotToTrackedKeys (or slotToRings) exactly like your probe reverse-map, so each updateSlotValue can push into the correct ring(s) in O(#keys-on-that-slot).

That gives you:
•	no per-frame scan over tracked keys
•	correct behavior even if slots update multiple times per frame (or not at all)
•	deterministic ordering (matches scheduler writes)

So data flow becomes:
Runtime → DebugService.updateSlotValue → HistoryService.onSlotWrite(slotId, type, components/stride)

2) Use Float32, not Float64

History should match runtime precision and avoid doubling bandwidth/cache footprint:
•	ring buffers should be Float32Array, including stride-1. Your sparkline doesn’t benefit from 64-bit.

3) Your DebugTargetKey.port needs port identity that survives renames

portName is not a stable key long-term (rename/refactor breaks history identity). Prefer:
•	portId (stable internal id) if you have it, or
•	blockId + portId where portId is the canonical PortId used in the normalized graph.

If you only have portName today, lock it as an invariant: port names are stable IDs, not display labels.

4) Multi-component history: record all components; leave projection to ViewMode (as you said)

Your plan is correct here: store Float32Array(capacity * stride) and ViewMode decides magnitude vs per-component lines. Add a hard rule:
•	HistoryService does no unit/payload interpretation and does no projection.

Revised lifecycle (minimal edits)
•	track(key):
•	resolve key → { slotId, type, stride } via DebugService metadata
•	allocate ring Float32Array(capacity * stride)
•	register (key → ring) and update reverse map (slotId → keys[])
•	onMappingChanged:
•	for each tracked key, re-resolve to slotId; rebuild reverse map
•	onSlotWrite(slotId, sampleComponents4, stride):
•	push into all rings attached to that slotId (stride-aware)
•	getHistory(key):
•	returns stable view object { buffer, writeIndex, capacity, stride, filled } (no allocation)

With those changes, Section 3 becomes correct and matches your earlier “O(1) per write” performance constraints.
