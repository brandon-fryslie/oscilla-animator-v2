# Rust/WASM Debug ABI for Edge/Port Probes

Status: proposed  
Owner: runtime + debug-viz  
Scope: browser UI retained, renderer/runtime moved toward Rust/WASM

## 1. Goals

// [LAW:verifiable-goals] This migration must define deterministic acceptance criteria.
- Preserve the current debug UX:
  - any edge or port can be inspected on demand,
  - lens before/after comparison remains available,
  - probe updates target ~5fps for interactive debug,
  - multi-lane visualizations remain possible.
- Reduce JS<->Rust interop surface to a small command/data protocol.
- Keep implementation WebGPU-spec-compatible in browser environments.

## 2. Non-Goals

// [LAW:no-mode-explosion] Do not add parallel legacy/new debug modes that diverge indefinitely.
- No promise of zero-frame-latency debug reads from GPU state.
- No full-arena readback at interactive cadence.
- No elimination of JS entirely (browser UI remains JS/TS).

## 3. Current Baseline (for parity)

- On-demand edge/port tracking exists in JS DebugService.
- Lens preview uses dual probes (before/after) and compares series.
- Mini-view polling currently runs at 250ms (4Hz), not 5Hz.
- Multi-lane field views already support:
  - aggregate stats,
  - instance history,
  - time x lane heatmap buffers.
- Scalar spy loop exists separately and is already asynchronous.

## 4. Architecture Shift

// [LAW:single-enforcer] Rust runtime owns probe cadence and readback scheduling.
// [LAW:one-source-of-truth] Rust owns canonical target->slot resolution for debug sampling.
// [LAW:dataflow-not-control-flow] Every debug tick follows one fixed pipeline; variability is encoded in subscription data.

### 4.1 Control Plane (JS -> Rust)

Single command API (`debug_command`) with tagged payloads:

1. `set_subscriptions`
2. `clear_subscriptions`
3. `set_rate_hz` (default `5`)
4. `set_budget_bytes` (default e.g. `65536`)
5. `request_snapshot_now` (best effort)

Each subscription includes:

- `target_id` (stable debug target id),
- `source_kind` (`edge` | `port`),
- `slot_id`,
- `sample_kind` (`scalar` | `lane_window` | `stats_only` | `histogram`),
- `component_mask` (bitmask for vec/color components),
- `lane_window` (`start`, `count`, optional downsample mode),
- `priority` (for budget trimming).

### 4.2 Data Plane (Rust -> JS)

Single batched packet API (`debug_poll_packet`) returning the newest packet since last poll.

Packet header:

- `version: u16`
- `sequence: u32`
- `captured_at_ms: f64`
- `runtime_frame_id: u32`
- `sample_count: u16`

Per-sample descriptor:

- `target_id: u32`
- `slot_id: u32`
- `payload_kind: u8`
- `stride: u8`
- `lane_count: u16`
- `value_offset: u32`
- `value_len_f32: u32`
- `flags: u16` (`fresh`, `downsampled`, `partial_budget`, `nan_detected`)

Payload blob:

- contiguous `f32` values for all samples.

## 5. Canonical Sample Kinds

// [LAW:one-type-per-behavior] One sample envelope type with `payload_kind` variants; avoid duplicate per-viz wire types.

1. `scalar`:
   - values: `[c0..c(stride-1)]`
   - intended for one-cardinality ports/edges.
2. `lane_window`:
   - values: AoS lane slice for selected range.
   - intended for sparkline/heatmap/transfer-curve input.
3. `stats_only`:
   - values: `[count, min*, max*, mean*]`
   - intended for low-cost field summaries.
4. `histogram`:
   - values: `[bin_count, min, max, ...bins]`
   - intended when lane count is too high for raw windows.

## 6. Budget and Cadence Rules

// [LAW:single-enforcer] Budget enforcement happens only in Rust before packet emission.

- Target cadence: `5Hz` (200ms).
- Hard per-tick byte budget (`budget_bytes`) for all sample payloads.
- Trim order when over budget:
  1. drop lowest priority subscriptions first,
  2. downgrade `lane_window` -> `histogram` if configured,
  3. reduce lane window count with explicit `partial_budget` flag.
- Never block render dispatch waiting for debug readback.

## 7. Lens Before/After Support

Lens preview remains a UI concern with two subscriptions:

1. `before` target (edge or port)
2. `after` target (port)

UI derives:

- latest values,
- delta (`after - before`),
- dual trace and/or transfer curve overlays.

No special ABI for lens is required beyond stable target ids and synchronized packet sequence/frame metadata.

## 8. Multi-Lane Visualization Support Matrix

Supported:

- heatmap from `lane_window` sequences,
- distribution from `histogram`,
- aggregate trend from `stats_only`,
- transfer-curve for adapter/lens by pairing two lane-window streams.

Not guaranteed at full fidelity:

- full raw lane dumps for very large lane counts at 5Hz under tight bandwidth budgets.

## 9. WebGPU Compatibility Requirements

// [LAW:one-source-of-truth] Readback implementation follows WebGPU copy+map lifecycle as the single approved path.

- Readback buffers use `COPY_DST | MAP_READ`.
- Copy commands are recorded after compute/render writes and before submit completion for that cycle.
- `mapAsync` is awaited off the render hot path.
- Buffers are unmapped immediately after CPU copy-out.
- Double-buffer readback is required to avoid map/write contention.

## 10. JS/Rust Interop Minimization

Interop is reduced to:

- command writes (`debug_command`),
- packet polling (`debug_poll_packet`),
- optional health/status query.

No per-slot callback chatter across the boundary.

## 11. Failure/Health Signals

Packet-level flags:

- `stale` (no fresh capture in expected cadence window),
- `budget_clamped`,
- `subscription_invalid` (slot no longer mapped),
- `nan_detected` (for UI crash guard behavior).

Health query fields:

- `active_subscriptions`,
- `effective_rate_hz`,
- `dropped_samples_total`,
- `avg_packet_bytes`,
- `last_capture_age_ms`.

## 12. Rollout Plan

// [LAW:locality-or-seam] Introduce protocol seam first, then migrate internals behind it.

1. Add protocol seam in JS (adapter around current DebugService).
2. Implement Rust producer for scalar subscriptions only.
3. Switch lens before/after preview to protocol packets.
4. Add lane-window + stats sample kinds.
5. Add histogram downgrade path and budget enforcement.
6. Remove legacy direct JS read paths after parity gates pass.

## 13. Acceptance Gates

// [LAW:verifiable-goals] Each gate is machine-checkable.

1. `edge/port on-demand`
   - Given any mapped edge or port, subscription yields packets within 400ms worst-case at 5Hz target.
2. `lens parity`
   - Before/after probe pair updates with shared `sequence` and `runtime_frame_id`; delta visualization remains stable.
3. `multi-lane minimum contract`
   - For many-cardinality slot:
     - at least one of `lane_window`, `stats_only`, or `histogram` is delivered every probe tick.
4. `hot-path safety`
   - Render loop frame time p95 regression <= agreed threshold with probes off and with one active lens probe.
5. `budget correctness`
   - When budgets are exceeded, packets set `partial_budget` or downgrade flags, not silent truncation.

## 14. Open Decisions

1. Target id authority:
   - Keep existing debug index ids from compiler, or issue dedicated debug subscription ids at runtime boundary.
2. Binary encoding:
   - raw shared memory view vs copy-on-poll typed array boundary.
3. Histogram policy:
   - fixed bin count globally vs per-subscription bin count.

## 15. Implementation Prerequisite

The current repository does not yet contain a Rust Naga bridge crate; it uses a TypeScript shim for Naga compilation behavior.

// [LAW:one-source-of-truth] The Rust bridge implementation must replace the shim as the single Naga validation/emission authority.
- Add a Rust/WASM crate for Naga validation/emission.
- Keep this debug ABI independent of the compiler bridge implementation details.
- Integrate `wgpu` only for runtime/render backend unification (native + web), not as a replacement for browser UI.

---

This ABI is sufficient to move renderer/runtime execution into Rust while preserving the current browser UI debug workflow and minimizing interop cost.
