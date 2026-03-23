A “lane” is one element of a Field<T>(instance=I). If position is Field<vec2>(I), then lane k is the k-th vec2 in that buffer, and it corresponds to the same lane k in every other Field<…>(I) (color, size, shape, etc.).

What point are you clicking

You click a glyph that the UI draws from the position field for that instance:
•	For Field<vec2:ndc2>(I): the UI draws N dots on a 2D preview surface (an overlay viewport). Dot k is at (pos[k].x, pos[k].y) in normalized coordinates mapped to pixels.
•	For Field<vec3>(I): the UI draws N projected dots (e.g., camera projection or orthographic XY), still one dot per lane.

So the “point” is literally a rendered representation of lane k’s position.

How we are visualizing lanes

You visualize lanes as one of these field view modes (all instance-scoped):
1.	Spatial scatter (most common for layouts)

	•	draw one dot per lane at its position
	•	optional color = Field<color>(I) if present, else a default
	•	optional size = Field<float>(I) if present, else a default

	2.	Glyphs / sprites (when shape is involved)

	•	draw one instanced shape per lane using (shape[I], position[I], size[I], color[I])
	•	still one drawable per lane

	3.	Non-spatial views (when no position exists)

	•	sample grid of values (lane index on x/y)
	•	histogram/distribution
	•	top-k table
These still operate on lanes; they just don’t place them spatially.

How selection works (mechanically)

Selection is a UI state scoped to an instance:
•	SelectedLane = { instanceId: I, laneId: LaneId }
•	LaneId is either:
•	the lane index k (fast, but unstable when counts/reordering change), or
•	the stable elementId elementId[k] from the continuity/identity system (preferred if you have it)

Hit-testing in the spatial view:
1.	Convert click pixel to normalized/world coordinate space used by the preview.
2.	Find the nearest lane k (or all lanes within radius r), using:
•	brute force for small N
•	spatial hash / grid / k-d tree for large N
3.	Set SelectedLane to that lane.
4.	Any “selected-lane trace” panels now plot lane k across time for any Field<…>(I) output you choose.

Why this is useful

Once a lane is selected, the UI can show:
•	the lane’s current values across multiple fields aligned by instance (position, color, size, shape params)
•	the lane’s time history (sparkline)
•	debugging overlays (this lane’s elementId, normalizedIndex, randomId, etc.)

So “clicking a point selects a lane” means: you click the visual proxy for an element of an instance (usually drawn from position), and the system binds that element as the focus across all fields with the same instanceId.

---

With 5k lanes, “one dot per lane” is still feasible, but you need explicit policies so the UI stays responsive and selection stays reliable.

1) Rendering 5k lanes in the debug/preview UI

1.1 Use a dedicated, cached render path for previews

Don’t re-run the full patch renderer for debug overlays. The preview layer should:
•	read already-materialized buffers (position, optional color, optional size, optional shape)
•	draw with a tight loop and minimal state changes

5k circles per frame on Canvas2D is usually fine if you:
•	batch into a single path when possible (for dots)
•	avoid per-lane save()/restore() and string fillStyle churn
•	quantize style (bucket colors/sizes) if needed

1.2 Level-of-detail modes (deterministic)

You need a fixed LOD policy, not “maybe downsample”.

Define view modes for FieldView that are explicitly selectable and have deterministic defaults:
•	Full: draw all lanes (default up to a threshold, e.g. 10k)
•	Decimated: draw a deterministic subset (see §2)
•	Density: draw a heatmap / density field (no per-lane glyphs)
•	Focus+Context: draw all but with reduced detail except near selection

The default should be:
•	Full up to N=10k for dots
•	Density above that (or when performance budget exceeded)

2) Decimation that preserves stability

If you show a subset, it must be stable across frames and edits (as much as possible), otherwise the UI “sparkles”.

Use deterministic selection keyed by stable element identity (preferred) or lane index (fallback).

2.1 Stable identity path (preferred)

If instance has elementId: Uint32Array:
•	select lanes where hash(elementId) mod K == 0 (K chosen to hit target sample size)
•	this preserves which lanes appear even if order changes

2.2 No identity available

Use lane index:
•	select k = floor(i * N / M) for i in [0..M-1] (stratified sampling)
•	stable as long as ordering doesn’t change

No randomness. No per-frame reshuffle.

3) Hit-testing 5k lanes

Brute-force nearest neighbor over 5k is actually okay (5k distance checks on click is trivial). The hard part is:
•	you might have dense clusters where nearest is ambiguous
•	you might want hover selection at 60fps

So define two modes:

3.1 Click-only selection (simple and safe)
•	brute force on click: O(N)
•	choose nearest within pixel radius r; if none within r, no selection
•	if multiple within r, choose nearest; if tie, choose lowest elementId (deterministic)

This is enough for v1 debug UX.

3.2 Hover + lasso (optional later, but still deterministic)

If you want hover at 60fps or lasso:
•	build a uniform grid spatial hash each frame from positions (O(N))
•	query local cell(s) for candidates (fast)
This remains deterministic and straightforward.

4) Visualizing lanes at 5k without turning into noise

A 5k-point scatter can become unreadable. You need explicit display semantics:
•	Default dot size is constant in screen pixels (not world units) so density reads correctly.
•	When zoomed out, switch to density or alpha accumulation.
•	Provide a “color by” option:
•	color field if aligned to instance
•	otherwise normalizedIndex intrinsic (gradient) so structure is visible
•	Provide “highlight selected lane” as a strong overlay (outline/halo), not just color shift.

5) Selection identity: index vs elementId

If you have the continuity system giving you stable elementId, selection should store:
•	{ instanceId, elementId }

Then each frame you map elementId -> laneIndex via a lookup:
•	build elementIdToIndex map once per frame (or cache per instance)
•	if elementId disappears, selection becomes “unresolved” but retained (so it snaps back if it returns)

If you only store lane index, selection will jump when layout/count changes.

6) Performance budget rule (explicit)

Set a hard UI budget for preview rendering, separate from runtime:
•	If preview draw exceeds X ms for Y consecutive frames, auto-switch view mode to Density or Decimated, and show a visible indicator.

No silent degradation.
