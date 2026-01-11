---
command: /canonicalize-architecture design-docs/spec/ Please apply this refinement document to the remaining unresolved questions @"design-docs/spec/_architecture-refinement/ChatGPT-Fundamental Axes in Systems.md"
reviewed_files:
  - CANONICALIZED-SUMMARY-oscilla-v2-20260109-120000.md
  - CANONICALIZED-QUESTIONS-oscilla-v2-20260109-120000.md
  - CANONICALIZED-GLOSSARY-oscilla-v2-20260109-120000.md
status: REVIEW_COMPLETE
---

# Peer Design Review: Oscilla v2.5 Type System

Generated: 2026-01-09T13:00:00Z
Reviewer: Claude (peer review)

---

## Overall Assessment

This is a solid, well-thought-out architecture. The five-axis type system is elegant - it takes the implicit structure that was hiding in the old `World` enum and makes it explicit without adding runtime overhead. The "no optional fields" discipline via `AxisTag<T>` is particularly nice; it forces you to be explicit about defaults rather than letting `undefined` sneak in everywhere.

The refinement document clearly came from someone who's thought deeply about type systems and understands the difference between topology (domain) and semantics (binding). That separation is correct and will pay dividends when you hit edge cases. The compile-time erasure strategy is sound - you get expressive types for the author without paying for them at runtime.

My main concerns are around implementation ambiguity (some specs feel 80% there but would leave an implementer guessing) and a few places where the v2.5 refinement introduces complexity that might not be needed in v0. There's also a lingering inconsistency between the source invariants doc and the canonicalized output that should be reconciled.

**Verdict**: Approve with concerns

---

## What I Like

- **The `AxisTag<T>` pattern**: Brilliant way to handle "default unless specified" without optional fields. This will make TypeScript's type narrowing work beautifully.

- **Domain as compile-time resource, not wire value**: This is the right call. Domains flowing on wires would have been a mess for type inference and runtime performance.

- **Explicit Cardinality/Temporality split**: The old `World` enum conflated "how many" with "when" (event was doing double duty). Separating them is cleaner.

- **Runtime erasure as a hard constraint**: Good that this is stated up front. It prevents scope creep where someone adds "just one little runtime check."

- **Strict unification rules**: `instantiated(X) + instantiated(Y) → error` is correct. No implicit coercion means errors are caught early.

- **"Useful defaults, not zeros"**: Using `phaseA` rail instead of `0.0` for float defaults is smart for an animation system - things move by default.

- **Block.kind instead of Block.type**: Small but important. Reserving `type` for the type system avoids confusion.

---

## Blocking Concerns

### [B1]: Source Invariants Document Contradicts Canonicalized Output

**Where**: `00-invariants.md` section 5 vs CANONICALIZED-QUESTIONS C1

**The Issue**: The source invariants file still lists **Lag** as a stateful primitive:

```
- 4 stateful primitive blocks:
**UnitDelay**: one-frame delay, used to break feedback loops
**Lag**: smoothing (linear/exponential)
**Phasor**: phase accumulator (0..1 ramp)
**SampleAndHold**: latch on trigger
```

But the canonicalized output says "Lag doesn't exist - remove from all docs" and lists 4 primitives as UnitDelay, Phasor, SampleAndHold, **Accumulator**.

**Why It Matters**: If someone reads the source invariants (which claims to be "non-negotiable rules"), they'll think Lag exists. If they read the canonicalized output, they'll think it doesn't. This is exactly the kind of contradiction canonicalization is supposed to resolve - but the source doc wasn't updated.

**My Suggestion**: Before generating the master compendium, decide:
1. Does Lag exist or not? (The canonicalized output says no)
2. Is Accumulator the 4th primitive? (The canonicalized output says yes, source says no)
3. Update the source invariants doc OR explicitly note that the master compendium supersedes it

**Questions for the Author**:
- Was "Lag doesn't exist" a deliberate design decision or an oversight?
- What was Lag supposed to do that can't be composed from other primitives?

---

### [B2]: Stateful Primitive Count Still Unclear (3 vs 4)

**Where**: CANONICALIZED-QUESTIONS C1 resolution vs CANONICALIZED-SUMMARY

**The Issue**: The resolution says "Canonical stateful primitives: UnitDelay, Phasor, SampleAndHold, Accumulator" (4 primitives). But multiple places in the canonicalized docs say "Lag doesn't exist" as if there were originally 4 and now there are 3. The math doesn't add up.

Reading between the lines, I think the situation is:
- Original v2 spec had: UnitDelay, Lag, Phasor, SampleAndHold (4)
- Refinement says: Remove Lag, Accumulator is distinct from Phasor
- Canonical should be: UnitDelay, Phasor, Accumulator, SampleAndHold (4)

But this isn't stated clearly anywhere.

**Why It Matters**: The stateful primitives are load-bearing. Getting this wrong breaks feedback loop validation.

**My Suggestion**: Add a clear "before/after" in the questions doc:
- **Before**: UnitDelay, Lag, Phasor, SampleAndHold
- **After**: UnitDelay, Phasor, Accumulator, SampleAndHold
- **Change**: Removed Lag (doesn't exist), clarified Accumulator is distinct from Phasor

---

## Non-Blocking Concerns

### [N1]: Binding/Perspective/Branch Might Be YAGNI

**Where**: T-NEW-6, T-NEW-7 in CANONICALIZED-QUESTIONS

**The Issue**: Three of the five axes (Binding, Perspective, Branch) are "v0 default-only" - meaning they exist in the type coordinate but do nothing. This is design for future extensibility, but it adds concepts that v0 implementers have to understand even though they can't use them.

**Why I'm Raising It**: Every concept has a learning cost. A new team member has to understand what Binding/Perspective/Branch *are* even if they're told "just use defaults." The refinement document's rationale ("so you can add multi-view and multi-history later") is valid, but is that a real requirement or speculation?

**Suggestion**: Consider making the v0 spec simpler by defining a `SignalTypeV0` that only has the axes that matter:
```ts
type SignalTypeV0 = {
  payload: PayloadType;
  cardinality: Cardinality;
  temporality: Temporality;
};
```
Then evolve to the full 5-axis `SignalType` when you need Binding/Perspective/Branch.

**Alternative View**: The "encode now, implement later" approach does prevent breaking changes. If you're confident you'll need these axes, having them in the type now avoids a migration later. Your call.

---

### [N2]: Event Payload is Very Constrained

**Where**: A5, Event Payload section in GLOSSARY

**The Issue**: Event payload is defined as `{ key: string, value: float | int }`. This is quite restrictive - no vec2, no bool, no nested structures.

**Why I'm Raising It**: I can imagine wanting to send richer event data. A MIDI-like event might want `{ key: "noteOn", value: { pitch: 60, velocity: 100 } }`. The current design forces you to either:
- Split into multiple events (`noteOn_pitch`, `noteOn_velocity`)
- Encode complex data as floats somehow

**Suggestion**: Consider if this constraint is intentional or just an early simplification. If intentional, document *why* (e.g., "runtime performance requires fixed-size event buffers").

**Alternative View**: Keeping events simple might be the right call for v0. Complex event payloads add serialization overhead and type complexity. You can always expand later.

---

### [N3]: Default Source Ambiguity for Fields

**Where**: G1, Default Sources section in SUMMARY

**The Issue**: The default source table lists defaults by PayloadType, but doesn't address how defaults work for Fields (cardinality=many). If I have a `field<float>` input with no writer, does the default source:
1. Broadcast `phaseA` to all lanes? (every element gets the same phase)
2. Generate a field where each lane gets its own value? (element-dependent)
3. Something else?

**Why I'm Raising It**: This matters for the "useful defaults" goal. If the default for a `field<float>` is just `phaseA` broadcast, every element starts identical - not very interesting for animation.

**Suggestion**: Clarify default source behavior for fields. Maybe: "For field inputs, default source provides `Id/U01` (element-normalized index) for appropriate types, otherwise broadcasts the signal default."

---

### [N4]: No Specification for Per-Lane Events

**Where**: T-NEW-10, "Per-lane Event" concept

**The Issue**: The taxonomy defines "Per-lane Event" as `many(domain) + discrete`, but there's no specification for how per-lane events actually work:
- How is the "did this lane fire?" information encoded?
- Is it a sparse list? A bitmap? A full array with sentinel values?
- How do per-lane events interact with combine modes?

**Why I'm Raising It**: Per-lane events are unusual. Most reactive systems don't have them. An implementer would have to guess at the representation.

**Suggestion**: Either spec this out or explicitly defer it: "Per-lane events are not implemented in v0."

---

### [N5]: Combine Mode Underspecified for Some Types

**Where**: Combine Modes section in SUMMARY

**The Issue**: Combine modes are listed as:
- Numeric: sum, average, min, max, mul
- Any: last, first, layer
- Boolean: or, and

But what about:
- `phase` - Is it numeric? Does `sum` wrap?
- `vec2` - Does `sum` add component-wise?
- `color` - What does `average` mean for colors? Linear interpolation in sRGB? Linear RGB?

**Why I'm Raising It**: These edge cases will come up as soon as someone tries to combine two color wires.

**Suggestion**: Add a "Combine Mode Semantics by Type" table that handles the non-obvious cases.

---

## Questions & Clarifications

### [Q1]: What exactly does `cardinality = zero` mean for runtime?

**Context**: The mapping says `static` → `cardinality = zero`, and the description says "compile-time constant, no runtime lanes."

**My Current Understanding**: A `zero` cardinality value doesn't exist at runtime at all - it's inlined by the compiler. So `Constant(5)` with cardinality=zero produces no slot, just literal `5` in the generated code.

**What I Need Clarified**: Is this correct? And what happens if a block with `zero` output connects to a block expecting `one`? Is that automatically promoted, or is it a type error?

---

### [Q2]: How does domain alignment validation work?

**Context**: The spec says "Two `many` values are aligned iff they reference the same DomainId. No mapping/resampling exists in v0."

**My Current Understanding**: If I have `field<float>` on domain A and `field<float>` on domain B, I can't add them - type error.

**What I Need Clarified**: How does this interact with unification? If one side is `AxisTag.default` and the other is `AxisTag.instantiated(domainA)`, does the default side adopt domainA? Or is it an error because the default side has no domain?

---

### [Q3]: Where does the DomainDecl live in the patch?

**Context**: "Domains are patch-level resources" and "A domain block is not an executable block; it is a DomainDecl resource entry."

**My Current Understanding**: There's a separate `domains: DomainDecl[]` array in the patch/normalized graph, distinct from the nodes array.

**What I Need Clarified**: How does the user create a domain in the UI? Is `DomainN(100)` a block or a resource? The basic-12 list includes "DomainN" as a block, but the spec says domains aren't blocks.

---

## Nits & Polish

| # | Location | Comment |
|---|----------|---------|
| 1 | SUMMARY line 243 | "MVP Rails: time, phaseA, phaseB, pulse (not progress)" - But TimeRoot outputs `progress`. Clarify that progress exists but isn't a rail. |
| 2 | GLOSSARY line 488 | `FieldSlot` still has `domain: DomainId` in runtime storage, but you said domain is erased. Should this be `laneCount: number` instead? |
| 3 | QUESTIONS line 395 | `DerivedBlockMeta` has `port?: string` in lens target - optional field violates "no optionals" principle |
| 4 | SUMMARY line 71 | "structural → derived" appears in naming changes but the old term was already resolved in prior canonicalization |
| 5 | GLOSSARY | Missing entry for `ReferentRef` which is used in Binding definition |
| 6 | General | Inconsistent use of "trigger" vs "pulse" - TimeRoot output is `pulse` but concept is called "Trigger" |

---

## Consistency Audit

### Cross-Reference Check

| Claim | Source | Verified? | Notes |
|-------|--------|-----------|-------|
| 4 stateful primitives | SUMMARY line 218-224 | Partial | Lists 4, but doesn't match source invariants doc |
| Lag doesn't exist | QUESTIONS C3 | Yes | Consistently stated |
| Accumulator distinct from Phasor | QUESTIONS C2 | Yes | Stated in both SUMMARY and QUESTIONS |
| Domain not on wires | GLOSSARY line 183 | Yes | Consistently stated |
| No custom combine modes | QUESTIONS A2 | Yes | Consistently stated |
| Runtime erasure | SUMMARY line 290-295 | Yes | Consistently stated |

### Terminology Consistency

| Term | Definition Location | Used Consistently? | Issues |
|------|--------------------|--------------------|--------|
| PayloadType | GLOSSARY line 55 | Yes | - |
| Extent | GLOSSARY line 68 | Yes | - |
| SignalType | GLOSSARY line 86 | Yes | - |
| Cardinality | GLOSSARY line 114 | Yes | - |
| Temporality | GLOSSARY line 132 | Yes | - |
| Trigger | GLOSSARY line 413 | Partial | Called "pulse" in TimeRoot outputs |
| Field | GLOSSARY line 187 | Yes | - |

---

## Implementation Readiness

Could someone implement this spec as written?

- [x] All types fully specified
- [ ] All behaviors unambiguous (see N3, N4, N5)
- [ ] Error cases covered (what errors does axis unification produce?)
- [ ] Edge cases documented (see Q1, Q2, Q3)
- [x] No circular definitions
- [x] No "TBD" or "TODO" items remaining

**Gaps that would block implementation**:
1. Per-lane event representation (N4)
2. Field default source behavior (N3)
3. Cardinality promotion rules for zero→one (Q1)
4. Domain alignment in unification (Q2)
5. DomainN as block vs resource contradiction (Q3)

---

## Summary

| Category | Count |
|----------|-------|
| Blocking Concerns | 2 |
| Non-Blocking Concerns | 5 |
| Questions | 3 |
| Nits | 6 |

**Recommendation**: Approve after addressing blocking concerns

**Next Steps**:
1. Reconcile the Lag/Accumulator discrepancy (B1, B2)
2. Decide whether to address non-blocking concerns or accept them as-is
3. Clarify the questions if possible
4. Proceed to user approval walkthrough
