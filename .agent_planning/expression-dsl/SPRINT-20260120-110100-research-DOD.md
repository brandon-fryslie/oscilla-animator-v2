# Definition of Done: Research Sprint

Generated: 2026-01-20 11:01:00
Confidence: MEDIUM
Plan: SPRINT-20260120-110100-research-PLAN.md

## Acceptance Criteria

### Parser Implementation Approach Decision

- [ ] Document pros/cons of each approach with specific metrics (bundle size, LOC, complexity)
- [ ] Prototype minimal parser with each approach (literal + binary op only)
- [ ] Measure bundle size impact of any library dependencies
- [ ] Document chosen approach with rationale in `expression-dsl/DECISIONS.md`
- [ ] Verify chosen approach can produce good error messages for common mistakes

### Type Inference Strategy Specification

- [ ] Document type inference rules in `expression-dsl/TYPE-RULES.md`
- [ ] Specify handling for each PayloadType (float, int, bool, phase, unit, vec2, color)
- [ ] Define allowed type coercions with rationale
- [ ] Specify polymorphic literal resolution strategy
- [ ] Document type checking algorithm (unification-based or constraint-based)
- [ ] Provide 10+ example expressions with expected types or type errors

### Error Handling Strategy Specification

- [ ] Document error taxonomy in `expression-dsl/ERRORS.md`
- [ ] Define error message format with position information
- [ ] Specify error recovery strategy (fail-fast vs multi-error)
- [ ] Provide examples of each error category with good/bad messages
- [ ] Verify error format integrates with existing CompileError type
- [ ] Document how errors appear in UI (inline vs panel)

### Grammar Specification Document

- [ ] Create `src/expr/GRAMMAR.md` with complete EBNF notation
- [ ] Document operator precedence table (matches JavaScript/C)
- [ ] List all supported functions with signatures
- [ ] Provide 20+ example expressions with expected parses
- [ ] Include negative examples (invalid syntax)
- [ ] Mark grammar as FROZEN with change process

### Built-in Functions Catalog

- [ ] Create `src/expr/FUNCTIONS.md` with function catalog
- [ ] Document each function: name, signature, description, IR mapping
- [ ] Verify all functions map to existing OpCodes or IRBuilder methods
- [ ] Group functions by category (math, interpolation, etc.)
- [ ] Identify any functions that need new OpCodes (flag for future work)

## Exit Criteria (to reach HIGH confidence)

This research sprint successfully raises confidence to HIGH when:

- [ ] Parser approach chosen with clear rationale
- [ ] Type inference rules are unambiguous and complete
- [ ] Error handling strategy provides good UX
- [ ] Grammar is documented and frozen
- [ ] All built-in functions verified to have IR mappings
- [ ] No blocking unknowns remain for core implementation sprint

## Deferred Work

The following items are explicitly OUT OF SCOPE for this sprint:

- **Implementation** - Actual parser/compiler code (deferred to core-implementation sprint)
- **UI Integration** - Expression block UI (deferred to integration sprint)
- **Advanced Features** - Vec2/color support, custom functions (deferred to future)
- **Performance Optimization** - Parser/compiler performance (defer until proven needed)

## Deliverable Files

Expected outputs from this sprint:

- `.agent_planning/expression-dsl/DECISIONS.md` - Parser approach decision
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference specification
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling specification
- `src/expr/GRAMMAR.md` - Grammar specification (canonical)
- `src/expr/FUNCTIONS.md` - Function catalog
- Prototype code (can be throwaway) demonstrating parser approaches
