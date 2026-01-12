# Work Evaluation - Doc-Index Skill
**Timestamp**: 2026-01-12T01:33:29Z
**Scope**: work/doc-index-skill
**Confidence**: FRESH

## Goals Under Evaluation

From HANDOFF-doc-index-evaluation-20260111-104500.md:

1. Achieve 75% token reduction (20-25% retained)
2. Enable contradiction detection without reading full docs
3. Provide accurate line references for targeted lookups
4. Work with simplified instructions (87 lines vs 260)
5. Assess production readiness for canonicalize-architecture integration

## Previous Evaluation Reference

None - this is the first evaluation of doc-index skill.

## Persistent Check Results

No automated checks exist for this skill. Manual validation only.

## Manual Runtime Testing

### What I Tried

1. **Compression Verification**: Word-counted 3 sample files (type-system, diagnostics-system, INVARIANTS)
2. **Line Reference Spot-Check**: Verified 6 random line references against source content
3. **Contradiction Detection Trial**: Attempted to find type system contradictions using only indexes
4. **Completeness Assessment**: Compared INVARIANTS.md full doc vs index for omissions

### What Actually Happened

#### 1. Compression Claims: SEVERELY MISLEADING

**Claimed**: 75% reduction (25% retained)
**Actual**: Results are INVERTED

| File | Source Words | Index Words | Claimed | Actual | Error |
|------|-------------|-------------|---------|--------|-------|
| 01-type-system | 1736 | 674 | 21% | 38% | +17% |
| 07-diagnostics | 3469 | 515 | 83% | 14% | -69% |
| INVARIANTS | 1893 | 614 | 79% | 32% | -47% |

**Root cause**: The frontmatter claims are BACKWARDS. The implementer confused:
- "Compression ratio" (what percentage you KEEP) 
- "Compression reduction" (what percentage you ELIMINATE)

When the index says `compression: 21%`, that means "index is 21% the size of original" (i.e., 79% reduction).
When it says `compression: 83%`, that's WRONG - the actual retention is 14%, not 83%.

**The 75% reduction claim IS achieved** (indexes are 14-38% of original = 62-86% reduction), but the metadata is backwards and inconsistent.

#### 2. Line Reference Accuracy: EXCELLENT

Spot-checked 6 references across 3 files:

| Reference | Claimed Content | Actual Line Content | Match |
|-----------|----------------|---------------------|-------|
| [L52] | PayloadType excludes event/domain | "PayloadType does **NOT** include 'event' or 'domain'" | ✅ |
| [L83-99] | AxisTag discriminated union | Complete AxisTag definition with rationale | ✅ |
| [L24] | Diagnostics are structured facts | "not a console log... structured, addressable, stable fact" | ✅ |
| [L299] | Diagnostic ID field | "id: string; // hash(code + primaryTarget...)" | ✅ |
| [L8] | Invariants non-negotiable | "These rules are non-negotiable. Violations indicate bugs." | ✅ |
| [L17-26] | I1 monotonic time | Complete I1 invariant with rule, rationale, consequences | ✅ |

**Accuracy**: 6/6 = 100%

Line references are PRECISE and RELIABLE.

#### 3. Contradiction Detection: PARTIAL SUCCESS

**Attempted**: Find type system contradictions using only 3 indexes (type-system, block-system, diagnostics-system).

**Contradictions Found**:

1. **Domain Cardinality Confusion** (Type System vs Block System)
   - Type-system INDEX: "Cardinality.many has domain: DomainRef" [L109-113]
   - Type-system INDEX: "Domain is NOT a wire value - compile-time resource only" [L123-139]
   - Block-system INDEX: "DomainN" listed as one of "Basic 12 Blocks (MVP)" [L237-254]
   
   **Question surfaced**: If domains are compile-time only, why is DomainN a runtime block? Is this a DomainDecl vs DomainN distinction?
   
   **Fidelity assessment**: Index DOES capture enough to detect potential contradiction, but lacks detail to resolve it without source read.

2. **Diagnostic ID Scope Ambiguity**
   - Diagnostics INDEX: "ID includes patchRevision: same error in different patch = different diagnostic instance" [L354-366]
   - Diagnostics INDEX: "patchRevision in diagnostic ID ensures same error in different patch = different instance" [L354-366]
   
   **Not a contradiction - just verbose index entry. Confirms consistency.**

3. **Missing Contradiction NOT Detected**
   - I searched for timing/continuity contradictions between invariants and type system
   - Found none in indexes, but **cannot verify if source docs have such contradictions** without reading them
   
   **False negative risk**: Indexes may miss subtle semantic contradictions that aren't explicit assertions.

**Verdict**: Contradiction detection is **VIABLE but INCOMPLETE**. You can detect:
- Explicit conflicts in definitions
- Missing concepts (references without definitions)
- Tier classification mismatches

You CANNOT detect:
- Semantic contradictions that require understanding context
- Implicit assumptions that conflict
- Design philosophy inconsistencies

#### 4. Completeness Check: ACCEPTABLE LOSSES

Compared INVARIANTS.md (31 invariants) vs INVARIANTS.INDEX.md:

**Omissions**:
- ❌ **I27 details missing**: Index says "Toy detector meta-rule" but omits the critical examples (no UI order, object identity, incidental eval). This is a **critical omission** - the examples ARE the invariant.
- ✅ All 31 invariants are listed with IDs and line references
- ✅ Key assertions extracted correctly
- ✅ Category groupings preserved (Time, Graph, Render, Debug, Scale, Arch)

**Minor losses**:
- Rationale text is heavily compressed (acceptable)
- Consequences and enforcement details omitted (acceptable - can be looked up)
- Cross-references between invariants omitted (acceptable - navigable via line refs)

**Critical omissions**: 1 (I27 examples)
**Important omissions**: 0
**Minor omissions**: ~20 (rationale details)

## Data Flow Verification

Not applicable - doc-index is a skill, not a data flow system.

## Break-It Testing

### Attack: Contradictory Instructions

**Test**: What if the skill instructions are ambiguous about what to extract?

**Finding**: The 87-line skill says "Key Assertions - Any MUST/MUST NOT/SHALL statements" but doesn't specify:
- What if a document uses "REQUIRED" instead of "MUST"?
- What if assertions are in paragraph form, not bulleted?
- What if assertions conflict with each other in the same doc?

**Severity**: MEDIUM - Instructions are simplified but not comprehensive. Could cause inconsistent extraction.

### Attack: Source Changes After Indexing

**Test**: What if source document changes but index isn't regenerated?

**Finding**: Index has `source_hash` and `source_mtime` for staleness detection, BUT:
- No tooling exists to CHECK staleness
- No mechanism to AUTO-REGENERATE stale indexes
- No warning system when using stale indexes

**Severity**: HIGH - Indexes will silently go stale and mislead agents.

### Attack: Large Documents

**Test**: What happens with very large documents (10K+ words)?

**Finding**: Not tested (no such docs in corpus), but skill has no special handling for:
- Pagination of indexes
- Hierarchical summarization
- Section-level indexing

**Severity**: LOW - Current corpus doesn't need it, but scalability is unknown.

## Evidence

**Files examined**:
- `/Users/bmf/code/oscilla-animator-v2/.claude/skills/doc-index/SKILL.md`
- `/Users/bmf/code/oscilla-animator-v2/.claude/skills/doc-index/references/index-format.md`
- `/Users/bmf/code/oscilla-animator-v2/design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.INDEX.md`
- `/Users/bmf/code/oscilla-animator-v2/design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.INDEX.md`
- `/Users/bmf/code/oscilla-animator-v2/design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.INDEX.md`
- Source documents for all of the above

**Compression calculation**:
```bash
wc -w source.md index.md
# Then: actual_compression = (index_words / source_words) * 100
```

## Assessment

### ✅ Working

- **Line references**: 100% accuracy on spot-check (6/6 correct)
- **Compression achievement**: 62-86% reduction achieved (target was 75%)
- **Haiku execution**: Successfully generated 16 indexes without human intervention
- **Simplified instructions**: 87 lines IS executable (vs complex 260-line version)
- **Basic contradiction detection**: Can find explicit conflicts in definitions and assertions

### ❌ Not Working

- **Compression metadata**: Frontmatter claims are BACKWARDS and MISLEADING
  - `compression: 21%` should mean "79% reduction" but is presented as "21% compression"
  - `compression: 83%` is flat-out WRONG (should be 14%)
  - Inconsistent interpretation across files
  
- **Critical completeness gaps**: I27 in INVARIANTS.INDEX.md omits the defining examples
  
- **No staleness detection tooling**: `source_hash` exists but nothing checks it

- **Ambiguous extraction rules**: "MUST/MUST NOT/SHALL" is too narrow; real docs use varied phrasing

### ⚠️ Ambiguities Found

| Decision | What Was Assumed | Should Have Asked | Impact |
|----------|------------------|-------------------|--------|
| Compression metric | "compression: X%" means X% retained | Is this retention percentage or reduction percentage? | Metadata is backwards |
| Extraction completeness | Listing invariant IDs is sufficient | Should examples and rationale be preserved? | I27 loses critical content |
| Staleness handling | Hashes are enough | How should stale indexes be detected and handled? | Indexes will silently rot |
| Instruction scope | MUST/SHALL covers all assertions | What about REQUIRED, SHOULD, imperative sentences? | May miss assertions |

## Missing Checks (implementer should create)

1. **Staleness validator** (`just validate:indexes`)
   - Check all INDEX.md files for stale `source_hash`
   - Report which indexes need regeneration
   - Should run in CI

2. **Compression metadata corrector** (`just fix:compression-metadata`)
   - Recalculate all compression percentages
   - Fix backwards/inconsistent claims
   - Standardize format (e.g., always report "% reduction")

3. **Completeness checker** (`just check:index-completeness`)
   - Compare index vs source for critical omissions
   - Flag invariants without examples
   - Flag definitions without line refs

4. **Line reference validator** (`just validate:line-refs`)
   - Parse all [L123] and [L123-130] references
   - Verify they point to existing lines
   - Report broken references

## Verdict: INCOMPLETE

**Production readiness**: NOT READY as-is. Needs fixes before integration.

**Blockers**:
1. Compression metadata is misleading (MUST fix)
2. No staleness detection tooling (MUST create)
3. Critical completeness gaps (SHOULD fix)
4. Ambiguous extraction rules (SHOULD clarify)

**What's good**:
- Line references are reliable
- Compression targets are achieved (despite bad metadata)
- Simplified instructions work with Haiku
- Basic contradiction detection is viable

**What needs work**:
- Fix compression percentage interpretation (backwards)
- Add staleness detection tooling
- Clarify extraction rules for edge cases
- Review all indexes for I27-style omissions

## What Needs to Change

1. **SKILL.md:42** - Clarify compression metric
   - Current: `compression: {percentage}%`
   - Should be: `compression_reduction: {percentage}%` OR `size_retained: {percentage}%`
   - Pick ONE interpretation and enforce consistently

2. **All INDEX.md frontmatter** - Recalculate and fix compression claims
   - Script to iterate all indexes
   - Calculate actual: `(index_words / source_words) * 100`
   - Update frontmatter consistently
   - Decide: report retention or reduction (NOT BOTH with same label)

3. **SKILL.md:20** - Expand assertion extraction rules
   - Current: "Any MUST/MUST NOT/SHALL statements"
   - Should include: "REQUIRED, SHOULD, imperative assertions, bolded requirements"
   - Add examples of what to extract

4. **Create staleness checker script** - New file needed
   - `scripts/validate-indexes.sh`
   - Check `source_hash` against current source
   - Report stale indexes
   - Return non-zero exit code if any stale

5. **INVARIANTS.INDEX.md:49** - Add I27 examples back
   - Current: "Toy detector meta-rule (no UI order, object identity, incidental eval)"
   - Should preserve: The three critical "if X, then toy" patterns from source
   - This is NOT optional fluff - it's the invariant's definition

## Questions Needing Answers (if PAUSE)

None - this is INCOMPLETE, not PAUSE. The issues are clear and fixable.

## Honest Opinion

This is a **useful proof-of-concept** that achieved its core goals (compression, line refs, Haiku execution) but has **sloppy metadata and missing tooling** that make it not-yet-production-ready.

**The good**: The indexes DO work for contradiction detection. I found a potential domain/block confusion just by reading 3 indexes. Line references are spot-on. The 87-line instructions are vastly better than 260-line complexity.

**The bad**: The compression percentages are a mess - backwards, inconsistent, and misleading. Anyone reading "compression: 83%" will think the index is 83% of original (massive inflation) when it's actually 14% (aggressive compression). This will confuse agents and humans alike.

**The ugly**: No staleness detection means these indexes will rot silently as source docs evolve. In 2 weeks, half the indexes will be stale and no one will notice until an agent makes a bad decision based on outdated info.

**Recommendation**: 
1. Fix compression metadata (1 hour - scripted)
2. Add staleness checker (2 hours - bash script)
3. Review all indexes for I27-style omissions (1 hour - manual)
4. Then integrate into canonicalize-architecture

**Timeline**: 4 hours of cleanup → production ready.

**Alternative**: Use as-is for exploration, but add a giant warning "INDEXES MAY BE STALE, VERIFY CLAIMS" and don't trust compression percentages.

**My call**: Fix it. The core tech works, the metadata is fixable, and the ROI is high. But shipping it with backwards percentages is embarrassing.
