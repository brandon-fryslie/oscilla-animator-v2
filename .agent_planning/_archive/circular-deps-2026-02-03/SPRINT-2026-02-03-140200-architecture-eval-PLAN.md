# Sprint: architecture-eval - Evaluate Long-Term Architecture for blocks/compiler Boundary
Generated: 2026-02-03-140200
Confidence: HIGH: 0, MEDIUM: 1, LOW: 2
Status: RESEARCH REQUIRED
Source: EVALUATION-2026-02-03-131723.md

## Sprint Goal
Determine whether the bidirectional blocks/ <-> compiler/ dependency should be resolved, and if so, which architectural option is best.

## Scope
**Deliverables:**
- Analysis document comparing Option A (status quo), Option B (compiler owns lowering), and Option C (shared IR primitives layer)
- Prototype of Option C if deemed viable
- User decision on preferred architecture
- Migration effort estimate for chosen option

## Work Items

### P2 - Analyze Option C: Shared IR Primitives Layer [MEDIUM]

**Dependencies**: None (can research independently)
**Spec Reference**: CLAUDE.md "ONE-WAY DEPENDENCIES" law
**Status Reference**: EVALUATION-2026-02-03-131723.md "The Real Architectural Question"

#### Description
The evaluation identified Option C as the "least disruptive" approach: extract shared types (OpCode, Indices, stableStateId) into a new shared layer that both `blocks/` and `compiler/` import from, eliminating the bidirectional dependency.

Research what would need to move:
- `OpCode` enum (from `compiler/ir/types.ts`) -- imported by ~10 block files
- `stableStateId` function (from `compiler/ir/types.ts`) -- imported by ~5 block files
- `ValueExprId` type (from `compiler/ir/Indices.ts`) -- imported by ~4 block files
- `valueSlot`, `SYSTEM_PALETTE_SLOT` (from `compiler/ir/Indices.ts`) -- imported by 1 block file
- `LowerSandbox` class (from `compiler/ir/LowerSandbox.ts`) -- imported by 1 block file (this is the hardest to move)

Estimate: how many files change, what breaks, does it actually improve the architecture or just move the problem?

#### Acceptance Criteria
- [ ] List of types/values that would move to shared layer, with import count for each
- [ ] Assessment of whether LowerSandbox can be cleanly extracted (it imports from blocks/registry)
- [ ] Dependency graph before/after showing the cycle is actually broken
- [ ] Estimated file change count and risk assessment

#### Unknowns to Resolve
1. Can LowerSandbox be extracted without creating a NEW cycle through the shared layer? -- Analyze its dependencies
2. Does moving OpCode break the "IRs have explicit ownership" guideline from CLAUDE.md? -- Judgment call
3. Would a shared layer become a "junk drawer" that violates "Small and crisp" modules? -- Depends on scope

#### Exit Criteria (to reach next confidence level)
- [ ] Clear yes/no recommendation on Option C viability
- [ ] If yes: concrete file list and migration plan

---

### P2 - Evaluate Option A (status quo) trade-offs [LOW]

**Dependencies**: None
**Spec Reference**: CLAUDE.md "ONE-WAY DEPENDENCIES" law vs pragmatic design
**Status Reference**: EVALUATION-2026-02-03-131723.md Section 2

#### Description
The current architecture (Option A) works in practice despite the bidirectional dependency. The evaluation notes that Node.js handles the cycle via partial module initialization and it causes no runtime failures. The question is whether the violation of ONE-WAY DEPENDENCIES is acceptable as a pragmatic trade-off.

Arguments FOR keeping status quo:
- It works; no runtime issues
- Block lowering logic is colocated with block definitions (good locality)
- Changing it would touch ~30+ files with non-trivial risk

Arguments AGAINST:
- Violates ONE-WAY DEPENDENCIES universal law
- Makes it harder to reason about module initialization order
- Could cause subtle issues if block registration order changes

This item requires user input on how strictly to enforce the ONE-WAY DEPENDENCIES law when the "cycle" is between two tightly-coupled peer modules within the compilation domain.

#### Acceptance Criteria
- [ ] Trade-off analysis documented with pros/cons
- [ ] User consulted on whether blocks/ and compiler/ should be considered "peers within one compilation domain" or "separate layers"
- [ ] Decision recorded

#### Unknowns to Resolve
1. User preference: strict one-way enforcement vs pragmatic peer relationship? -- Must ask user
2. Is there a meaningful risk from the current cycle, or is it purely theoretical? -- Analyze Node.js module loading behavior

#### Exit Criteria (to reach next confidence level)
- [ ] User has stated preference
- [ ] Risk assessment completed (theoretical vs real)

---

### P3 - Evaluate Option B: Compiler Owns All Lowering [LOW]

**Dependencies**: None
**Spec Reference**: CLAUDE.md "pipelines-compilers" context-specific rules
**Status Reference**: EVALUATION-2026-02-03-131723.md "Option B"

#### Description
In Option B, blocks would only define metadata and type constraints. All lowering logic (the `lower()` functions currently in block files) would move into compiler-owned modules. This eliminates the bidirectional dependency entirely: compiler -> blocks (one-way).

This is the cleanest architecturally but the most disruptive. It would:
- Move lower() from every block definition into compiler/backend/
- Break the current pattern where block behavior is self-contained
- Centralize all block-specific IR generation in the compiler

This needs evaluation but is likely NOT the right choice given the codebase's design philosophy of blocks as self-contained units.

#### Acceptance Criteria
- [ ] Migration scope estimated (number of lower() functions, lines of code)
- [ ] Impact on block extensibility assessed (can users add custom blocks easily?)
- [ ] Comparison with Option C on disruption vs architectural benefit

#### Unknowns to Resolve
1. How many blocks have lower() functions? -- Grep codebase
2. Would centralizing lowering make it harder to add new block types? -- Design judgment
3. Does the spec have any opinion on block self-containment? -- Check ESSENTIAL-SPEC.md

#### Exit Criteria (to reach next confidence level)
- [ ] Scope quantified
- [ ] Recommendation: pursue or abandon Option B

## Dependencies
- All three work items can be researched in parallel
- Final decision requires user input (blocks Sprint 2: Evaluate Option A)
- If Option C is chosen, a NEW implementation sprint would be created

## Risks
- **Risk**: Analysis paralysis -- spending too much time evaluating options for a non-critical issue.
  **Mitigation**: Time-box research to 2 hours. If no clear winner, recommend status quo + boundary enforcement (Sprint 2) as sufficient.
- **Risk**: User may prefer an option that requires significant migration effort.
  **Mitigation**: Present effort estimates upfront so the decision is informed.
- **Risk**: The "shared IR primitives" layer (Option C) may introduce a new architectural smell (grab-bag module).
  **Mitigation**: Define strict scope: only types/values imported by BOTH blocks/ and compiler/. Nothing else.
