# Sprint: future-renderers - Additional Renderers & Enhancements

Generated: 2026-01-22
Confidence: MEDIUM
Status: RESEARCH REQUIRED

## Sprint Goal

Extend the debug visualization system with additional payload renderers, multi-component history support, and enhanced field visualization.

## Known Elements

- ValueRenderer registry and fallback ladder are in place
- Sparkline handles stride=1 signals
- DistributionBar handles stride=1 field stats
- HistoryService infrastructure supports stride but currently guards to stride=1

## Unknowns to Resolve

1. **Phase renderer UX** — How should phase wrap-around be visualized in the value display (as opposed to sparkline markers)? Options: circular dial, linear with wrap indicator, or same as float with unit label.
2. **Multi-component signal history** — How to push vec2/vec3/color signal values through DebugTap (currently only `recordSlotValue(slotId: number, value: number)` — scalar only). Requires DebugTap API extension.
3. **Shape thumbnail** — What rendering approach for shape preview? Canvas path from topology params, or rely on existing renderer infrastructure?
4. **ColorGradientBar** — Should field color distribution show a literal color gradient from sampled lanes, or just per-channel DistributionBars?
5. **Selected lane echo** — How does lane selection state get communicated to the MiniView? Global store? Context? Props?

## Tentative Deliverables

### Phase Renderer (float:phase)
- Registered as exact match: `float:phase01`
- Scalar mode: value displayed as [0..1) with unit label
- Aggregate mode: circular distribution or linear with wrap-aware stats
- Sparkline already handles wrap markers (from Sprint 2)

### Int Renderer
- Registered as exact match: `int`
- Integer formatting (no decimal places)
- Aggregate mode: integer min/max/mean

### Shape Renderer (shape:none — if sampleable ever becomes true)
- Topology ID display
- Param snapshot (up to 4 params)
- Tiny canvas thumbnail in local space
- Note: currently `sampleable: false` — may need SampleSource changes

### Multi-Component Signal History
- Extend DebugTap: `recordSlotComponents?(slotId: ValueSlot, components: Float32Array, stride: number): void`
- HistoryService: lift stride=1 guard, allocate Float32Array(128 * stride) for stride > 1
- Sparkline: plot magnitude or per-component lines (ViewMode decides projection)
- Enables color signal sparkline (luminance projection)

### ColorGradientBar (Field Color Distribution)
- Shows color gradient from sampled lanes (deterministic sample, 256 max)
- Replaces DistributionBar for color fields in FieldViewMode
- Requires sampling infrastructure (stable selection from lane indices)

### Selected Lane Echo
- If global selection exists matching this instance, show `selected[k]=...` using ValueRenderer
- Requires lane selection store (separate concern from debug-viz)
- Gated by: selection infrastructure existing

### Guards Summary Line
- NaN count, Inf count, OOR count (out-of-range relative to unit contract)
- Computed per-frame from slot writes (or cached from HistoryService scan)
- Only shown when non-zero

### Event Timeline (temporality=discrete)
- Fired badge: yes/no per frame
- Micro-timeline: tick marks over last 128 frames
- Rate calculation if cached
- Requires event routing through DebugTap

## Research Tasks

- [ ] Decide phase renderer UX: circular dial vs linear (ask user, show mockups)
- [ ] Prototype DebugTap extension for multi-component writes
- [ ] Determine whether shape topology is extractable from current IR for thumbnail
- [ ] Design lane selection state architecture (separate from debug-viz or integrated?)
- [ ] Determine event routing: do events flow through DebugTap at all currently?

## Exit Criteria (to reach HIGH confidence)

- [ ] Phase renderer UX decided and mockup approved
- [ ] DebugTap multi-component API designed (backward compatible)
- [ ] Shape sampleability decision made (keep false or extend)
- [ ] Lane selection architecture documented (even if deferred)
- [ ] Event system integration path identified
