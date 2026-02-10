---
command: /canonicalize-docs design-docs/CANONICAL-oscilla-v2.5-20260109
reviewed_files:
  - CANONICALIZED-SUMMARY-update-20260209-051500.md
  - CANONICALIZED-QUESTIONS-update-20260209-051500.md
  - CANONICALIZED-GLOSSARY-update-20260209-051500.md
  - CANONICALIZED-TOPICS-update-20260209-051500.md
status: REVIEW_COMPLETE
---

# Peer Design Review: Update 2026-02-09

Generated: 2026-02-09T13:00:00Z
Reviewer: Claude (peer review)

---

## Overall Assessment

This update integrates 11 source documents covering 6 topic areas (color, multi-component signals, pure lowering, lenses, normalized units, obligations/cardinality vars) into the existing 22-topic canonical spec. The analysis was thorough — contradictions were correctly identified, resolutions are well-reasoned, and the user's corrections during Q&A improved accuracy significantly. The new topics (23-26) are well-scoped and correctly tiered.

The main concern is **incomplete integration**: several resolution actions have not been carried through to the canonical documents. The summary claims "INTEGRATION COMPLETE" but there are stale values in Topic 01, the GLOSSARY, and ESSENTIAL-SPEC that contradict resolved questions. Additionally, Topic 27 (Obligation-Driven Normalization) was resolved as "adopt" but no topic file was created.

**Verdict**: Approve with concerns — 3 blocking issues (all fixable without re-review) + 4 non-blocking.

**UPDATE 2026-02-09**: All 3 blocking concerns (B1, B2, B3) and non-blocking concerns (N1, N2) have been fixed. See applied changes below.

---

## What I Like

- **User corrections sharpened the resolutions**. Q2 (unit vs space), Q4 (fixpoint loop already exists), Q7 (lenses are port decorators, not edge decorators) — in each case the user pushed back on the initial analysis and the corrected resolution is better.
- **Hybrid A+ evaluation model** (Q1) is a pragmatic, evidence-based resolution. Matching the implementation rather than theorizing about alternatives is exactly right.
- **Topic 23 (Color System)** is clean and well-organized: structural T2 content separated from catalog T3 content. The "no implicit color space conversion" rule is a good invariant.
- **Topic 25 (Pure Lowering)** captures the right abstraction level — LowerSandbox as T2, API surface details as T3.
- **Topic 26 (Lens System)** correctly reflects the user's correction: "there is no lens catalog, there is a block catalog, and blocks can be used as lenses." This is an important conceptual distinction.
- **Cross-referencing** between new topics and existing topics is thorough.

---

## Encyclopedia Structure Review

### Topic Organization

| Topic | Assessment | Notes |
|-------|------------|-------|
| 23 - Color System | Good | Clean T2/T3 split, correct UnitType integration |
| 24 - Multi-Component Signals | Good | Solid T2 focus on evaluation model and slot allocation |
| 25 - Pure Lowering | Good | Right abstraction level, good connection to Topic 04 |
| 26 - Lens System | Good | Correctly reflects "blocks as lenses" model |
| 27 - ODN (proposed) | Missing | Q4 resolved as "adopt" but no topic file created |

### Tier Classification Review

| Topic | T1 Files | T2 Content | T3 Content | Assessment |
|-------|----------|------------|------------|------------|
| 23 - Color | — | UnitType extension, compatibility rules | Block catalog, lowering details | Good tier split |
| 24 - Multi-Component | — | Eval model, slot allocation | HistoryService guard | Good. HistoryService guard is correctly T3 |
| 25 - Pure Lowering | — | LowerSandbox, effects-as-data, purity enforcement | — | LowerSandbox as T2 per user direction. Sound |
| 26 - Lens System | — | What is a lens, lens vs adapter | Categories table | Good tier split |

**Tier Concerns**:
- The **Normalized Unit Policy** in Topic 01 is labeled "Foundational" in the heading. User explicitly said this is "FAR more than just guidance" and is "a critical foundational piece of our number system." The current placement as a subsection of UnitType in Topic 01 (T2) seems right — it's structural. But the informational item (I3) still calls it "authoring guidance" which contradicts the user's correction. This needs reconciliation.

### Structure Concerns

The updated Topics 01 and 04 now have pure-lowering and fixpoint-loop content integrated inline. This is fine for now but Topic 04 is getting long — future updates should consider whether the fixpoint loop deserves its own section heading vs. being woven into "Stage 2: GraphNormalization."

### Suggested Changes

- Create Topic 27 (ODN) per Q4 resolution
- Consider promoting the "stride table" out of Topic 01 and into Topic 24 (Multi-Component Signals) as its natural home, with Topic 01 just cross-referencing it

---

## Blocking Concerns

### [B1]: cameraProjection stride=16 is wrong in 4 canonical locations

**Where**: Topic 01 (01-type-system.md lines 93, 103), GLOSSARY.md (line 30), ESSENTIAL-SPEC.md (line 102)

**The Issue**: Q6 resolution explicitly states: "cameraProjection stride is 1 (not 16 as spec says — verify and update)." The implementation confirms stride=1. But the resolution was never applied — all 4 locations still say stride=16.

**Why It Matters**: This is a factual error in the canonical spec. Anyone implementing from the spec would allocate 16 floats for a value that is actually 1 float. The cameraProjection payload is a closed enum (orthographic | perspective), not a 4x4 matrix.

**My Suggestion**: Update all 4 locations to stride=1. Also update Topic 24's stride table (which already correctly says stride=1).

**Questions for the Author**:
- Is there any reason cameraProjection would actually need stride 16? (I believe not — it's an enum, not a matrix)

---

### [B2]: Topic 27 (ODN) was resolved but never created

**Where**: CANONICALIZED-TOPICS-update-20260209-051500.md proposes Topic 27. Q4 resolution says: "Full ODN normalization will not be deferred. Add the work to beads."

**The Issue**: The summary claims "INTEGRATION COMPLETE" but Topic 27 was never written. There's no `topics/27-obligation-normalization.md` file.

**Why It Matters**: ODN is the architectural direction for normalization. Without a topic file, the resolution is captured only in the working files which will be archived. The canonical spec should contain the ODN architecture.

**My Suggestion**: Create `topics/27-obligation-normalization.md` with the T2 content from the CANONICALIZED-TOPICS proposal (obligation abstraction, pipeline restructuring, ObligationKind, AnchorRef, DefaultPolicyTable integration, I26 enforcement timing).

---

### [B3]: GLOSSARY Lens entry still says "transform subtype"

**Where**: GLOSSARY.md, Lens entry (line ~345): `**Type**: concept (transform subtype)`

**The Issue**: Q7 resolution explicitly says: "Remove the 'transform subtype' language, this was dropped." The GLOSSARY Lens entry still has `concept (transform subtype)` as its type classification. Additionally, the Transform entry in the GLOSSARY (line ~1382) still describes Lens as a "subtype" of Transform.

**Why It Matters**: The user was explicit that this language should be removed. Keeping it contradicts the Q7 resolution.

**My Suggestion**: Change Lens type to `concept` (remove "transform subtype"). Update the Transform GLOSSARY entry to remove the Lens subtype reference, or mark Transform as deprecated if the umbrella concept is no longer used.

---

## Non-Blocking Concerns

### [N1]: shape2d/shape3d stride inconsistency between spec and implementation

**Where**: Topic 01 (01-type-system.md), GLOSSARY.md, Topic 24 stride table

**The Issue**: The spec says shape2d stride=8 (u32 words) and shape3d stride=12 (u32 words). But the implementation's `payloadStride()` in `stride.ts` doesn't handle shape2d/shape3d at all — they'd throw at runtime. Topic 24 correctly classifies them as stride=0 (non-sampleable). These three claims are mutually inconsistent.

**Why I'm Raising It**: The "8 u32 words" represents the packed handle layout, not the stride in the `payloadStride()` sense. Stride-for-slot-allocation and packed-handle-size are different concepts. The spec conflates them.

**Suggestion**: Topic 01's PayloadType table should distinguish "packed size" (8 u32 words) from "payloadStride" (0, non-sampleable). The stride column should say 0 for shape2d/shape3d, with a note that the packed handle size is 8/12 u32 words respectively. Topic 24's stride table already gets this right.

**Alternative View**: The current table is fine if read as "storage size" rather than "payloadStride() return value" — but the comment on line 103 explicitly says this is `payloadStride()`, which is wrong.

---

### [N2]: GLOSSARY Stride entry lists `phase` and `unit` as PayloadTypes

**Where**: GLOSSARY.md, Stride entry (line ~618): `float`, `int`, `phase`, `bool`, `unit` → 1

**The Issue**: `phase` and `unit` are not PayloadType kinds. Phase is `float` with a specific UnitType. There is no `unit` PayloadType. This table appears to be from an earlier version of the spec.

**Suggestion**: Remove `phase` and `unit` from the stride-by-PayloadType list. Keep only the 9 canonical PayloadType kinds.

---

### [N3]: Informational I3 still describes normalized units as "authoring guidance"

**Where**: CANONICALIZED-QUESTIONS, I3 section (line ~286): "It's authoring guidance, not a structural change."

**The Issue**: The user explicitly corrected this: "IMPORTANT: this is FAR more than just 'guidance'. This is a critical foundational piece of our number system." The informational item's original assessment was overridden but the original text wasn't updated to reflect the user's correction.

**Suggestion**: Update the I3 informational item to reflect that normalized unit policy is foundational to the number system, not just guidance. The Topic 01 section heading ("Normalized Unit Policy (Foundational)") already reflects this correctly.

**Alternative View**: The CANONICALIZED-* files are working documents that will be archived, so this is cosmetic. But it could confuse future runs of the canonicalization tool.

---

### [N4]: SlotMetaEntry stride type is too narrow

**Where**: GLOSSARY.md SlotMetaEntry entry, `stride: 0|1|2|3|4`

**The Issue**: If cameraProjection has stride=1 (per B1 resolution), this range is correct. But if shape2d/shape3d are ever given a non-zero stride for their packed handle layout (8/12), this range would be wrong. The range should either match `payloadStride()` outputs exactly or be `number`.

**Suggestion**: Since shape2d/shape3d are stride=0 and everything else is ≤4, the `0|1|2|3|4` range is correct given B1 and N1 resolutions. Just verify this is still true after those fixes are applied.

---

## Questions & Clarifications

### [Q1]: What is the status of Obligation-Driven Normalization relative to the existing fixpoint loop?

**Context**: Q4 resolution says the fixpoint loop already implements the core idea, and the user said "Full ODN normalization will not be deferred." But the existing fixpoint loop in Topic 04 is described as iterative default-source insertion, not the full ODN abstraction (ObligationKind: missingInput, coerce, lens, busJunction).

**My Current Understanding**: The fixpoint loop is the *mechanism*, ODN is the *generalization*. The loop currently handles `missingInput` obligations implicitly. Coerce/lens/busJunction obligations would extend the loop.

**What I Need Clarified**: Should Topic 27 describe ODN as future generalization of the existing loop, or as the current architecture?

---

### [Q2]: Extract/Construct — ValueExpr kinds or something else?

**Context**: Topic 23 says "Extract and Construct are structural intrinsics (ValueExpr kinds)" and the GLOSSARY's ValueExpr entry lists 6 variants: Const, External, Intrinsic, Kernel, State, Time. Neither Extract nor Construct is listed.

**My Current Understanding**: The implementation has `construct` as a ValueExpr kind (verified in `value-expr.ts`). Extract may be implemented differently.

**What I Need Clarified**: Should the ValueExpr entry in the GLOSSARY be updated to include `construct` (and `extract` if it exists)?

---

## Nits & Polish

| # | Location | Comment |
|---|----------|---------|
| 1 | Q2 Status field | Typo: "RESOVLED" should be "RESOLVED" |
| 2 | Q5 Status field | Says "Resolve" (incomplete sentence, missing resolution text formatting) |
| 3 | Topic 23 | Still uses `{ kind: 'color', space: 'hsl' }` in one place (T2 section line 18: `space: 'hsl'`) — but wait, checking again: it says `unit: 'hsl'`. Disregard. |
| 4 | CANONICALIZED-TOPICS | Topic 23 T2 content list still says `{ kind: 'color', space: 'hsl' }` (line 18) — not updated per Q2 resolution |
| 5 | INDEX.md | Needs update_history entry for this integration (26 topics, 117 sources, 134 resolutions) — appears to already be updated |
| 6 | GLOSSARY Binding entry | Lists `{ kind: 'weak'; referent: ReferentRef }` etc. but Topic 01 says v0 uses `unbound` only and has no `referent` field. These definitions may be aspirational. Consider noting this. |

---

## Consistency Audit

### Cross-Reference Check

| Claim | Source | Verified? | Notes |
|-------|--------|-----------|-------|
| cameraProjection stride=16 | Topic 01, GLOSSARY | **No** | Implementation returns 1. Q6 flagged this. Not fixed. |
| shape2d stride=8 | Topic 01, GLOSSARY | **Partial** | Spec says 8 u32 words (packed size), but payloadStride() returns 0 (non-sampleable). Different concepts conflated. |
| Color UnitType uses `unit` sub-field | Topic 01, Topic 23, GLOSSARY | **Yes** | All canonical files consistent. Implementation matches. |
| UnitType has 6 kinds | Topic 01, GLOSSARY UnitType entry | **Yes** | `scalar` and `norm01` removed per Q3. |
| evaluateConstructSignal exists | Topic 24 | **Yes** | Verified in ValueExprSignalEvaluator.ts |
| LowerSandbox exists | Topic 25 | **Yes** | Verified at src/compiler/ir/LowerSandbox.ts |
| Fixpoint loop in normalization | Topic 04 | **Yes** | Implementation matches updated spec |
| Cardinality type variables implemented | Topic 01, I4 | **Yes** | 5-phase solver verified |

### Terminology Consistency

| Term | Definition Location | Used Consistently? | Issues |
|------|--------------------|--------------------|--------|
| Lens | GLOSSARY, Topic 26 | **No** | GLOSSARY still says "transform subtype" (B3) |
| Stride | GLOSSARY, Topic 01, Topic 24 | **No** | GLOSSARY lists `phase` and `unit` as PayloadTypes (N2) |
| cameraProjection stride | Topic 01, GLOSSARY, ESSENTIAL-SPEC | **No** | All say 16, should be 1 (B1) |
| DefaultPolicyTable | GLOSSARY, Topic 25 | Yes | Consistent |
| LowerSandbox | GLOSSARY, Topic 25, Topic 04 | Yes | Consistent |
| SlotMetaEntry | GLOSSARY, Topic 24 | Yes | Consistent |

### Cross-Topic Consistency

| Concept | Topics Mentioning | Consistent? | Issues |
|---------|-------------------|-------------|--------|
| Stride table | 01, 24, GLOSSARY | **No** | Three different stride tables with different values for cameraProjection and shape2d/shape3d |
| Color UnitType | 01, 23, GLOSSARY | Yes | All use `unit` sub-field |
| Pure lowering | 04, 25 | Yes | Topic 04 references Topic 25, content aligned |
| Lens definition | 14, 26, GLOSSARY | **Partial** | Topic 26 correct, GLOSSARY has stale "transform subtype" |
| Evaluation model | 05, 24 | Yes | Hybrid A+ consistent between topics |

---

## Implementation Readiness

Could someone implement this spec as written?

- [x] All types fully specified
- [x] All behaviors unambiguous (after Q1-Q8 resolutions)
- [x] Error cases covered
- [ ] Edge cases documented — stride 0 behavior needs more detail for implementers
- [x] No circular definitions
- [ ] No "TBD" or "TODO" items remaining — Topic 27 (ODN) needs creation
- [x] Topic boundaries clear for implementers
- [x] Tier classifications make sense
- [x] T1 content is small and critical

**Gaps that would block implementation**:
1. cameraProjection stride (B1) — wrong value would cause buffer overallocation
2. Missing Topic 27 — ODN direction resolved but not documented
3. Lens "transform subtype" language — confusing for implementers

**Tier Misclassifications that need fixing**:
None — tier assignments are sound.

---

## Summary

| Category | Count |
|----------|-------|
| Blocking Concerns | 3 |
| Non-Blocking Concerns | 4 |
| Questions | 2 |
| Nits | 6 |
| Topic Structure Issues | 1 (missing Topic 27) |
| Tier Misclassifications | 0 |

**Recommendation**: Approve after addressing blocking concerns

**Next Steps**:
1. Fix B1: Update cameraProjection stride from 16 to 1 in Topic 01, GLOSSARY, ESSENTIAL-SPEC
2. Fix B2: Create Topic 27 (ODN) from CANONICALIZED-TOPICS proposal
3. Fix B3: Remove "transform subtype" from GLOSSARY Lens entry
4. Address N1-N4 at discretion (recommended but not blocking)
5. Run approval process for finalization
