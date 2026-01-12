Non-technical Debug Spec: Diagnostics Rules Engine + Thresholds + Fix Mapping

the final non-technical piece that makes this feel effortless: the rules engine spec (the exact diagnostics, thresholds, and fix suggestions mapping) so junior engineers can implement it without “taste decisions.”

This is the part that makes the debugger feel like it “understands” the patch. It must be deterministic, bounded, and simple enough that junior engineers can implement it without inventing new behavior.

⸻

1) Inputs and outputs

1.1 Inputs (the engine sees only these)
	•	DebugGraph g
	•	DebugSnapshot now
	•	HistoryWindow h (derived from ring buffers, e.g. last 10s sampled at 10–15 Hz)
	•	For each busId: a fixed-size series of recent ValueSummary
	•	For each bindingId (optional): recent series if TRACE is enabled
	•	UIContext ctx (what the user is currently probing / where they clicked)
	•	busId / portKey / bindingId

1.2 Outputs

A deterministic set of Diagnostic records:

type Severity = 'info' | 'warn' | 'error';

interface Diagnostic {
  id: string;                 // stable hash of (type + targetId + key facts)
  severity: Severity;
  title: string;              // plain language
  description: string;        // 1–2 lines
  targets: TargetRef[];       // buses/ports/bindings involved
  evidence: EvidenceItem[];   // value snapshots + counts (small)
  fixes: FixActionSpec[];     // references to canonical fix actions
}

Where TargetRef is:

type TargetRef =
  | { kind: 'bus'; busId: string }
  | { kind: 'binding'; bindingId: string }
  | { kind: 'port'; portKey: string }
  | { kind: 'block'; blockId: string };

Fixes are specs, not executable functions:

interface FixActionSpec {
  kind: CanonicalFixKind;
  labelOverride?: string;
  params: Record<string, unknown>;
}

The UI turns FixActionSpec into an undoable transaction by routing to your store ops.

⸻

2) Deterministic evaluation order (critical)

The rules engine must run in a fixed order to avoid flickering diagnostics:
	1.	Fatal correctness (NaN/Inf, missing TimeRoot, type impossible)
	2.	Silent/Disconnected (bus silent, port unbound)
	3.	Conflicts (multiple publishers + last, palette fights)
	4.	Flatline / stuck (no motion)
	5.	Too sharp / jitter (motion but unpleasant)
	6.	Clipping / saturation (values out of expected range)
	7.	Cost (materializations, heavy lenses/adapters)

Within each category, evaluate targets in stable order:
	•	buses sorted by bus.sortKey then id
	•	bindings sorted by id
	•	ports sorted by PortKey

⸻

3) History statistics (must be cheap, bounded)

For each bus series over the last window, compute incrementally:

For numeric-ish types (num, phase, vec2 components):
	•	min, max, mean
	•	range = max-min
	•	deltaMean = mean(|x[i]-x[i-1]|)
	•	nanCount, infCount
	•	wrapCount (phase only: count crossings high→low)
	•	pulseCount (trigger only: count of fired samples)

For color:
	•	treat as RGBA packed int:
	•	compute per-channel min/max
	•	compute “color change rate” as count of frames where rgba != prev rgba

These stats are computed at the time you append to ring buffers (so the rules engine reads ready-made summaries).

⸻

4) Core diagnostics rules (canonical list)

Below are the rules you should implement first. Together they cover 90% of “why does nothing happen / why is it bad / why is it slow.”

Each rule includes:
	•	Condition
	•	Target
	•	Severity
	•	Evidence
	•	Fix mapping

⸻

Rule A: NaN/Infinity propagation

Condition
	•	now.health.nanCount > 0 OR now.health.infCount > 0
	•	OR any busNow summary is {t:'err'}

Severity: error
Targets: affected buses + top contributing bindings if TRACE available
Evidence: show which bus is err + counts
Fixes
	•	Disable the binding(s) feeding the broken bus (if identifyable)
	•	Insert Clamp lens on the binding (canonical safe clamp)
	•	Replace lens with safe preset if the offending lens is known (softclip instead of aggressive wavefolder)

FixActionSpecs:
	•	DisableBinding {bindingId}
	•	AddLens {bindingId, lensId:'Clamp', preset:'safe'}
	•	ReplaceLens {bindingId, lensIndex, lensId:'Softclip', preset:'safe'}

⸻

Rule B: Bus is silent (no enabled publishers)

Condition
	•	g.buses[busId].publisherIds exists but none enabled
	•	OR publisherIds is empty
	•	AND bus is referenced by at least one listener (otherwise ignore)

Severity: warn
Targets: busId + all listeners
Evidence: “0 enabled publishers”
Fixes
	•	Enable a disabled publisher if present
	•	Set silent value (edit bus.defaultValue)
	•	Create publisher from suggested compatible output (context-sensitive)

FixActionSpecs:
	•	EnablePublisher {publisherId}
	•	SetBusSilentValue {busId, value}
	•	CreatePublisherSuggestion {busId, suggestedFromPortKey}

⸻

Rule C: Port has no source (unbound input)

(Only applies if you allow inputs to exist without listener + default source.)
If Default Sources exist, this becomes: “Port is on default source.”

Condition
	•	Port is an input
	•	No bus listener feeding it
	•	No wire feeding it
	•	(or) it is fed by a Default Source

Severity
	•	info if Default Source present
	•	warn if truly unbound

Fixes
	•	Bind to a compatible bus
	•	Convert Default Source into a visible block (if you support “detach”)
	•	Add a modulator block and auto-bind (guided composition)

FixActionSpecs:
	•	BindPortToBus {portKey, busId}
	•	ReplaceDefaultSourceWithBlock {portKey, blockType}
	•	OpenBusPicker {portKey} (UI action)

⸻

Rule D: “Last” conflict (multiple publishers + last-writer mode)

Condition
	•	bus.combineMode === ‘last’
	•	enabledPublisherCount >= 2

Severity: warn
Evidence: list enabled publishers in sort order
Fixes
	•	Reorder publishers (adjust sortKey)
	•	Disable all but one
	•	Change combine mode to sum/max (domain-aware suggestion)

FixActionSpecs:
	•	ReorderPublishers {busId, newOrder:[publisherId...]}
	•	DisablePublisher {publisherId}
	•	SetCombineMode {busId, mode:'sum' | 'max'}

Domain-aware default:
	•	number/energy: suggest sum
	•	phase: suggest last (but encourage reorder) or “phase blend” if you ever support it
	•	palette: suggest layer

⸻

Rule E: Flatline (signal constant over time)

Condition (numeric/phase/vec2)
	•	range < epsRange over last window
	•	and bus is used (has listeners) or is a primary bus (phaseA/energy/pulse/palette)

Recommended eps by domain:
	•	number: epsRange = 1e-4
	•	phase: epsRange = 1e-4 OR wrapCount == 0 when it should be cycling
	•	vec2: both components range < eps

Severity: info (if intentional), warn if it should drive motion
Heuristic to decide warn:
	•	If bus is phaseA or pulse or energy and flatline → warn

Fixes
	•	Add a clock/modulator publisher (guided)
	•	Change TimeRoot to cyclic if phaseA is flatline
	•	Increase speed / period settings if phase too slow

FixActionSpecs:
	•	SuggestAddPublisher {busId, preset:'Oscillator'|'Noise'|'Clock'}
	•	SetTimeRootMode {mode:'cyclic', periodMs}
	•	AdjustBusPublisherParam {publisherId, param:'frequency', value} (implemented via default sources/lens params)

⸻

Rule F: Too sharp (high jitter / unpleasant motion)

Condition
	•	deltaMean > sharpThreshold for numeric/vec2
Threshold examples:
	•	number: deltaMean > 0.05 * max(1, |mean|)
	•	phase: ignore (phase is supposed to move)
	•	vec2: length(delta) large vs viewport scale (if available)

Severity: info/warn depending on magnitude
Fixes
	•	Add Slew lens on listener
	•	Add Softclip lens if oscillating out of range

FixActionSpecs:
	•	AddLens {bindingId, lensId:'Slew', preset:'medium'}
	•	AddLens {bindingId, lensId:'Softclip', preset:'safe'}

⸻

Rule G: Clipping / out-of-range

This requires that TypeDesc carries semantics or expected ranges for certain domains. If you don’t have that, keep it simple for known buses:

Condition
	•	For phase: value outside [0..1] (or err)
	•	For unit: outside [0..1]
	•	For color: invalid packing (shouldn’t happen)
	•	For energy: value > energyMax (define energyMax, e.g. 2.0)

Severity: warn
Fixes
	•	Add Clamp lens
	•	Reduce gain by adding Scale lens

FixActionSpecs:
	•	AddLens {bindingId, lensId:'Clamp', preset:'0..1'}
	•	AddLens {bindingId, lensId:'Scale', params:{k:0.5}}

⸻

Rule H: Performance heavy (materializations / hot path)

Condition
	•	now.perf.fieldMaterializations exceeds threshold per second
	•	worstFrameMs exceeds budget
	•	topMaterializers not empty

Severity: warn
Fixes
	•	Reduce Domain size (suggest editing the Domain block’s default sources)
	•	Add Reduce lens earlier (if you support it) or avoid field→signal conversions
	•	Disable heavy binding temporarily (“Mute expensive modulator”)

FixActionSpecs:
	•	SuggestReduceDomain {blockId, newCount}
	•	DisableBinding {bindingId}
	•	ShowPerformancePanel {focus:'materializations'}

⸻

5) Fix mapping must be canonical and limited

You must define an enum of canonical fix kinds and refuse to invent new ones casually:

type CanonicalFixKind =
  | 'EnablePublisher' | 'DisablePublisher'
  | 'EnableListener' | 'DisableListener'
  | 'SetCombineMode'
  | 'ReorderPublishers'
  | 'BindPortToBus'
  | 'SetBusSilentValue'
  | 'AddLens' | 'ReplaceLens' | 'RemoveLens'
  | 'AddPublisherSuggestion'
  | 'SetTimeRootMode'
  | 'AdjustValueSource'
  | 'NavigateTo';

If a diagnostic wants a fix outside the list, you add it intentionally.

This prevents the debug UI from turning into an uncontrolled mutation factory.

⸻

6) How diagnostics attach to Probe Cards vs Overview

6.1 Probe card diagnostics

When probing a target, show only diagnostics that reference that target, sorted:
	•	error > warn > info
	•	then by rule priority

Limit to 3 visible; “Show all” opens the diagnostics drawer filtered.

6.2 Overview diagnostics

The Overview tab shows a global list:
	•	errors first
	•	then warnings
	•	then “quality suggestions” info

But it must be capped:
	•	max 25 items shown
	•	a “filter” bar: Errors / Warnings / Motion / Time / Performance

⸻

7) Diagnostic stability (no flicker)

To prevent “diagnostic flicker” when values cross thresholds:
	•	add hysteresis to thresholds:
	•	e.g. sharpThreshold on → off requires dropping below 80% threshold
	•	require rule to be true for N samples before it appears (e.g. 3 snapshots)
	•	require rule to be false for M samples before it disappears (e.g. 5 snapshots)

This is vital for non-technical confidence.

⸻

8) Implementation plan (what junior engineers actually build)
	1.	Implement ring-buffer stats: min/max/range/deltaMean/wrapCount
	2.	Implement rule engine skeleton with deterministic ordering
	3.	Implement first 4 rules:
	•	NaN/Inf
	•	Bus silent
	•	Last conflict
	•	Flatline
	4.	Implement fix action executor that maps FixActionSpec → transaction
	5.	Wire probe card to show diagnostics + fixes
	6.	Add hysteresis + N-sample gating
	7.	Add perf-heavy rule once perf taps exist

That’s enough for the debugger to feel “smart.”

