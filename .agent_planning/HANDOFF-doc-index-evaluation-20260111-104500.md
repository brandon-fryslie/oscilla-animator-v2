# Handoff: Doc-Index Skill Evaluation

**Created**: 2026-01-11T10:45:00Z
**For**: do:work-evaluator agent
**Status**: ready-to-evaluate

---

## Objective

Critically evaluate the doc-index skill proof-of-concept that was just completed, with focus on: (1) whether the 75% compression claim is achievable/achieved, (2) whether the indexes provide sufficient fidelity for contradiction detection, (3) whether the lightweight instruction approach is sustainable, and (4) honest assessment of production readiness.

## Current State

### What's Been Done
- ✅ Created doc-index skill at `.claude/skills/doc-index/SKILL.md` (87 lines, simplified from 260)
- ✅ Generated 16 index files for canonical topics (15 topics + INVARIANTS.md)
- ✅ Achieved reported 75% compression (37,823 words → 9,139 words)
- ✅ Used claude-haiku-4-5 model successfully
- ✅ Validated line reference format [L123] and [L123-130]
- ✅ Created format specification at `.claude/skills/doc-index/references/index-format.md`

### What Needs Evaluation
- ❓ **Compression claim validity** - Is 75% compression real and useful, or are we losing critical information?
- ❓ **Contradiction detection capability** - Can indexes actually detect contradictions without reading full docs?
- ❓ **Instruction quality** - Are the simplified instructions (87 lines) clear enough or too vague?
- ❓ **Line reference accuracy** - Do [L###] references actually point to correct content?
- ❓ **Production readiness** - Is this ready for canonicalize-architecture integration or needs more work?

## Context & Background

### Why We're Doing This
The canonicalize-architecture skill needs to analyze large specification documents (15+ topics, 50K+ tokens) for contradictions. Loading everything is expensive. We need indexes that are:
- 75% smaller than originals (to fit in context)
- High-fidelity enough to detect contradictions
- Reliable with line references for targeted lookups

### Key Decisions Made
| Decision | Rationale | Date |
|----------|-----------|------|
| Simplified from 260→87 lines | Complex instructions failed with Haiku; lightweight worked | 2026-01-11 |
| Use [L123-130] format | More intuitive than [L123, 10 lines]; simpler for agents | 2026-01-11 |
| Target 20-25% compression | Originally wanted 20-25%, got ~25% average | 2026-01-11 |
| Drop descriptions, keep names | Assertions/invariants with refs only, no verbose explanations | 2026-01-11 |
| Use claude-haiku-4-5 | Cost-effective for batch indexing | 2026-01-11 |

### Important Constraints
- MUST achieve 75% token reduction (or indexing isn't worth the complexity)
- MUST enable contradiction detection without reading full docs
- MUST have accurate line references (indexes are useless if refs are wrong)
- SHOULD work with simplified instructions (complex = fragile)

## Acceptance Criteria

The doc-index skill is production-ready if:

- [ ] **Compression**: Average compression is 70-80% reduction (20-30% retained)
- [ ] **Fidelity**: Indexes contain enough info to detect T1/T2 contradictions
- [ ] **Accuracy**: Line references point to correct content (spot-check 10 random refs)
- [ ] **Completeness**: All critical assertions/invariants are extracted (no major omissions)
- [ ] **Clarity**: Haiku agent can execute instructions without human intervention
- [ ] **Consistency**: Similar documents produce similar-quality indexes

## Evidence to Evaluate

### Files to Examine

**Skill definition:**
- `.claude/skills/doc-index/SKILL.md` - The simplified 87-line skill

**Generated indexes (sample for spot-checking):**
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.INDEX.md` (21% compression claimed)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.INDEX.md` (23.6% compression claimed)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.INDEX.md` (14.9% compression claimed)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.INDEX.md` (32.4% compression claimed)

**Source documents (for comparison):**
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md`

### Metrics Claimed

```
Original Content: 37,823 words (~49,170 tokens)
Indexes Created:   9,139 words (~11,880 tokens)
Compression:       75% reduction (25% retained)
Target:            75% reduction (20-25% retained)
```

Per-file range:
- Best: 48% compression (graph-editor-ui - likely wrong, too high)
- Worst: 78% compression (time-system - very dense)
- Average: ~72% compression

## Evaluation Focus Areas

### 1. Compression Reality Check

**Task**: Verify compression claims are accurate and meaningful.

**Spot-check methodology**:
1. Pick 3 index files at random
2. For each:
   - Count actual words in source (verify against claim)
   - Count actual words in index (verify against claim)
   - Calculate compression = (index_words / source_words) * 100
   - Compare to frontmatter claim
3. Report discrepancies

**Success criterion**: Claimed compression matches actual within ±5%

### 2. Fidelity Assessment

**Task**: Determine if indexes contain enough info for contradiction detection.

**Test methodology**:
1. Read index for 01-type-system.INDEX.md
2. Read index for 02-block-system.INDEX.md
3. Without reading source docs, try to identify:
   - A potential contradiction (e.g., type definitions that conflict)
   - A missing concept (something referenced but not defined)
   - A tier classification mismatch
4. Use line references to verify findings in source docs
5. Report: Could you detect contradictions from indexes alone?

**Success criterion**: At least 2 contradictions detectable from indexes without source reads

### 3. Line Reference Accuracy

**Task**: Validate that [L###] references actually point to correct content.

**Spot-check methodology**:
1. Pick index: 01-type-system.INDEX.md
2. Select 10 random line references from different sections
3. For each [L123] or [L123-130]:
   - Read source at that line
   - Verify content matches index claim
   - Report any mismatches
4. Calculate accuracy: correct_refs / total_refs * 100

**Success criterion**: ≥90% accuracy on line references

### 4. Instruction Quality

**Task**: Assess whether simplified 87-line SKILL.md is clear enough.

**Evaluation questions**:
- Are extraction rules unambiguous?
- Would a different Haiku agent interpret these the same way?
- Are there missing edge cases?
- Is the output format spec clear?
- What would break if instructions were followed literally?

**Success criterion**: No critical ambiguities that would cause inconsistent extraction

### 5. Completeness Check

**Task**: Identify any critical omissions from indexes.

**Test methodology**:
1. Read INVARIANTS.md source (full doc)
2. Read INVARIANTS.INDEX.md (index)
3. Identify invariants in source that are NOT in index
4. Categorize omissions:
   - Critical (would break contradiction detection)
   - Important (reduces fidelity)
   - Minor (acceptable loss)
5. Report: Are omissions acceptable?

**Success criterion**: Zero critical omissions, <3 important omissions per doc

## Known Gotchas

**Compression percentage confusion**:
- Report says "72% compression" but that means 72% REDUCTION (28% retained)
- Verify this interpretation is correct throughout

**Haiku execution reliability**:
- Skill tool didn't give feedback, Task tool worked better
- May need to document this in skill usage notes

**Line reference format changed mid-development**:
- Started with [L123, 10 lines]
- Switched to [L123-130]
- Earlier indexes may use old format

**Source documents may have changed since indexing**:
- Indexes have source_hash for staleness detection
- Evaluate whether hash checking is reliable

## Reference Materials

### Planning Documents
- None (this was exploratory proof-of-concept work)

### Conversation Context
- Conversation started with canonicalize-architecture restructuring
- Pivoted to create doc-index skill as enabler
- Discovered lightweight instructions work better than complex specs
- Successfully batch-indexed all 16 canonical topics

### Codebase References
- `.claude/skills/doc-index/SKILL.md` - The skill itself
- `.claude/skills/doc-index/references/index-format.md` - Format specification
- All INDEX.md files in `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/`

## Questions & Blockers

### Open Questions for Evaluator
- [ ] Is 25% retention (75% reduction) actually useful, or too aggressive?
- [ ] Do indexes sacrifice critical nuance for compression?
- [ ] Are line references reliable enough for production use?
- [ ] Is Haiku model capable of consistent quality, or is this cherry-picked success?
- [ ] Should we validate ALL 16 indexes or spot-check subset?

### Honest Assessment Needed
- [ ] Would YOU trust these indexes for canonical spec contradiction detection?
- [ ] What are the failure modes we haven't considered?
- [ ] Is the skill sustainable or will it drift over time?
- [ ] What's the risk of false negatives (missed contradictions)?

## Testing Strategy

### Validation Tests to Run

**Test 1: Compression verification**
```bash
# For each INDEX file, verify compression claim
for idx in design-docs/CANONICAL-oscilla-v2.5-20260109/topics/*.INDEX.md; do
  src="${idx%.INDEX.md}.md"
  src_words=$(wc -w < "$src")
  idx_words=$(wc -w < "$idx")
  claimed=$(grep '^compression:' "$idx" | awk '{print $2}' | tr -d '%')
  actual=$((idx_words * 100 / src_words))
  echo "$idx: claimed=$claimed%, actual=$actual%"
done
```

**Test 2: Line reference spot-check**
- Pick 01-type-system.INDEX.md
- Extract all [L###] references
- Read corresponding source lines
- Verify content matches

**Test 3: Contradiction detection trial**
- Load 2-3 indexes
- Try to find contradictions
- Use line refs to verify
- Report success/failure

## Success Metrics

Evaluation is complete when:

- [ ] Compression claims validated (within ±5%)
- [ ] Line reference accuracy measured (≥90% target)
- [ ] Contradiction detection capability tested (2+ contradictions found)
- [ ] Critical omissions identified (zero expected)
- [ ] Honest production-readiness assessment provided
- [ ] Specific recommendations for improvement documented

**Production-ready criteria**:
- Compression: ✓ if 70-80% reduction verified
- Fidelity: ✓ if 2+ contradictions detectable from indexes
- Accuracy: ✓ if ≥90% line refs correct
- Clarity: ✓ if no critical instruction ambiguities
- Completeness: ✓ if zero critical omissions

---

## Next Steps for Evaluator Agent

**Immediate actions**:
1. Read this handoff document completely
2. Review skill definition at `.claude/skills/doc-index/SKILL.md`
3. Select 3 index files for spot-checking (suggest: 01, 07, INVARIANTS)

**During evaluation**:
1. Run compression verification on selected files
2. Spot-check 10 line references for accuracy
3. Attempt contradiction detection using only indexes
4. Identify critical omissions
5. Assess instruction clarity and sustainability

**Report structure**:
```markdown
# Doc-Index Skill Evaluation Report

## Executive Summary
[Overall assessment: production-ready | needs-work | not-viable]

## Compression Validation
- Claimed: X%
- Actual: Y%
- Assessment: [accurate | overstated | understated]

## Line Reference Accuracy
- Tested: N references
- Correct: M references
- Accuracy: P%
- Assessment: [reliable | unreliable]

## Contradiction Detection
- Attempted: N contradictions
- Detected from indexes: M
- Success rate: P%
- Assessment: [sufficient | insufficient]

## Completeness Analysis
- Critical omissions: N
- Important omissions: M
- Assessment: [complete | incomplete]

## Instruction Quality
- Ambiguities found: N
- Critical issues: M
- Assessment: [clear | vague | broken]

## Production Readiness
- Ready: [yes | no]
- Blockers: [list]
- Recommendations: [list]

## Honest Opinion
[Your unfiltered assessment of whether this is worth integrating]
```

**When complete**:
- [ ] Provide specific, actionable recommendations
- [ ] Identify any risks or failure modes
- [ ] State clearly whether to proceed or rework
