# Sprint Plan: Execution Model Documentation

**Generated**: 2026-01-27
**Timestamp**: 20260127-050130
**Topic**: Document why two-phase execution pattern in ScheduleExecutor is non-negotiable

## Sprint Goal

Create the first documentation for a new docs/ static site, comprehensively documenting the Oscilla execution model with focus on why two-phase execution is non-negotiable.

## Scope

**In scope (this sprint):**
1. Create docs/ folder structure for static site
2. Write comprehensive execution model documentation
3. Create illustrative examples (correct and incorrect patterns)
4. Cross-reference to implementation code

**Subsequent sprints (pending this sprint's completion):**
- Additional runtime documentation (continuity, hot-swap, state migration)
- Compiler documentation (passes, schedule generation)
- Block system documentation

## Work Items

### P0: Create docs/ folder structure

**Acceptance Criteria (REQUIRED):**
- [ ] `docs/` directory exists at project root
- [ ] `docs/runtime/` subdirectory created for execution docs
- [ ] `docs/README.md` exists with navigation/purpose statement
- [ ] Naming convention documented (e.g., `execution-model.md`, not numbered)

**Technical Notes:**
- Simple Markdown structure for static site (no build tooling this sprint)
- Use kebab-case for filenames
- Assume future static site generator (Hugo, Docusaurus, etc.)

### P1: Write execution model documentation

**Acceptance Criteria (REQUIRED):**
- [ ] `docs/runtime/execution-model.md` exists (~6-10k tokens)
- [ ] Covers the full frame execution lifecycle (not just two-phase)
- [ ] Explains two-phase pattern with clear rationale
- [ ] Documents what invariants depend on this pattern (especially I7)
- [ ] Includes schedule structure and step types

**Technical Notes:**
- Target audience: future maintainers with deep technical details
- Structure:
  1. Overview: Frame execution lifecycle
  2. The Problem: State causality in feedback loops
  3. The Solution: Two-phase execution model
  4. Phase 1 detailed: What happens, why it's safe
  5. Phase 2 detailed: State writes, causality preservation
  6. Schedule structure: Step types and ordering
  7. Buffer management and memory model
  8. State isolation and frame boundaries
  9. Invariants enforced by phasing
  10. Failure modes: What breaks if phases violated
  11. Maintenance guidelines: How to add new step types

### P2: Create illustrative examples

**Acceptance Criteria (REQUIRED):**
- [ ] Example 1: Correct feedback loop with UnitDelay showing proper delay semantics
- [ ] Example 2: Hypothetical violation showing what breaks without two-phase
- [ ] Example 3: Schedule structure example showing step ordering
- [ ] Examples use actual step types from ScheduleIR
- [ ] Each example includes brief explanation of why it works/fails

**Technical Notes:**
- Examples should be realistic (based on actual blocks)
- Use pseudocode or simplified IR notation
- Show state array values across frames where helpful
- May include ASCII diagrams for data flow

### P3: Add cross-references and integration

**Acceptance Criteria (REQUIRED):**
- [ ] Documentation references `src/runtime/ScheduleExecutor.ts` with line numbers
- [ ] Documentation references `src/compiler/passes-v2/pass7-schedule.ts`
- [ ] Documentation references relevant invariants from spec
- [ ] Code comments in ScheduleExecutor.ts updated to link to docs
- [ ] CLAUDE.md updated with brief mention and link to full doc

**Technical Notes:**
- Line numbers will become stale; link to functions/methods instead where possible
- Use relative paths for internal links
- Keep CLAUDE.md addition brief (3-4 sentences max)

## Dependencies

- Access to `src/runtime/ScheduleExecutor.ts` for implementation details
- Access to `src/compiler/passes-v2/pass7-schedule.ts` for schedule construction
- Access to `src/compiler/ir/types.ts` for step type definitions
- Access to `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` for invariants

## Risks

- **Documentation may become stale**: Mitigated by using function references over line numbers
- **Scope creep into continuity system**: Keep continuity mentions brief, defer to future doc
- **Examples may not cover all edge cases**: Focus on the core pattern, not exhaustive coverage

## Confidence & Decision Points

**This sprint's confidence:** HIGH
- Clear deliverables: folder structure, one main document, examples
- Narrow scope: execution model only, not entire runtime
- Source material exists: evaluation + implementation code

**Key assumptions:**
- Markdown is sufficient format (no MDX/special features needed)
- Static site tooling will be added later (this sprint is content-only)
- Future maintainers are the primary audience (not beginners)

**Next sprint trigger:**
- This documentation complete and reviewed
- Static site generator setup (optional)
- Additional runtime topics (continuity, hot-swap)
