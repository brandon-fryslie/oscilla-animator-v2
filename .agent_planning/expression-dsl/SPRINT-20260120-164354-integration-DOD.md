# Definition of Done: Integration Sprint

**Generated:** 2026-01-20 16:43:54
**Confidence:** HIGH
**Plan:** SPRINT-20260120-164354-integration-PLAN.md

## Sprint Goal

Wire the Expression DSL into the application so users can create Expression blocks, type mathematical expressions, and see them compile to IR and execute correctly.

---

## Acceptance Criteria

### 1. Expression Block Definition

**Deliverable:** Block registered in block registry and appears in UI

- [ ] Expression block type registered in `src/blocks/` (math-blocks.ts or new file)
- [ ] Block appears in block palette under "Math" category with label "Expression"
- [ ] Block has correct metadata: form='primitive', capability='pure', category='math'
- [ ] Block has 5 input ports: in0, in1, in2, in3, in4 (all optional, type='???')
- [ ] Block has 1 output port: out (type='???')
- [ ] Block has config parameter: expression (text, exposedAsPort=false, uiHint=text/multiline)
- [ ] User can add Expression block to patch via block palette
- [ ] Block renders correctly in patch editor (shows ports and label)

### 2. Block Lowering - Empty Expression

**Deliverable:** Empty expression compiles to constant 0

- [ ] Expression block with empty expression text compiles without error
- [ ] Output is `sigConst(0, canonicalType('float'))`
- [ ] Block can be used in patch with empty expression (outputs constant 0)

### 3. Block Lowering - Literal Expressions

**Deliverable:** Numeric literals compile correctly

- [ ] Expression `"42"` compiles to `sigConst(42, canonicalType('int'))`
- [ ] Expression `"3.14"` compiles to `sigConst(3.14, canonicalType('float'))`
- [ ] Output type matches literal type (int or float)
- [ ] Runtime execution produces correct constant value

### 4. Block Lowering - Simple Math

**Deliverable:** Binary operations compile to IR opcodes

- [ ] Wire Const(2.0) to in0, expression `"in0 * 3"` compiles to Mul opcode
- [ ] Wire Const(5) to in0, Const(3) to in1, expression `"in0 + in1"` compiles to Add opcode
- [ ] Expression `"in0 - in1"` compiles to Sub opcode
- [ ] Expression `"in0 / in1"` compiles to Div opcode
- [ ] Output type is correct (float when any operand is float, int when both int)
- [ ] Runtime execution produces mathematically correct results

### 5. Block Lowering - Function Calls

**Deliverable:** Function calls compile to correct opcodes

- [ ] Wire PhaseA to in0, expression `"sin(in0)"` compiles to Sin opcode
- [ ] Expression `"cos(in0)"` compiles to Cos opcode
- [ ] Expression `"abs(in0)"` compiles to Abs opcode
- [ ] Expression `"min(in0, in1)"` compiles to Min opcode (2-arg function)
- [ ] Expression `"clamp(in0, 0, 1)"` compiles to Clamp opcode (3-arg function)
- [ ] Output type matches function signature (e.g., sin→float, abs→same as input)
- [ ] Runtime execution produces correct function results

### 6. Block Lowering - Complex Expressions

**Deliverable:** Multi-operation expressions compile correctly

- [ ] Expression `"sin(in0 * 2) * 0.5 + 0.5"` compiles to nested IR ops
- [ ] Expression `"(in0 + in1) / 2"` compiles with correct precedence
- [ ] Expression `"in0 > 0 ? in1 : in2"` compiles to ternary (select) operation
- [ ] Expression respects operator precedence (PEMDAS)
- [ ] Expression respects parentheses for grouping
- [ ] Runtime execution produces correct results for complex expressions

### 7. Error Handling - Syntax Errors

**Deliverable:** Invalid syntax is caught and reported clearly

- [ ] Expression `"in0 +"` throws compile error with message "Expected expression after '+'"
- [ ] Expression `"sin("` throws error "Expected expression, got end of input"
- [ ] Expression `"in0 @"` throws error "Unexpected character '@'"
- [ ] Error includes position information (character offset)
- [ ] Error message is user-friendly (no compiler jargon)
- [ ] Block lowering fails gracefully (doesn't crash compiler)

### 8. Error Handling - Type Errors

**Deliverable:** Type mismatches are caught and reported with suggestions

- [ ] Wire PhaseA to in0, PhaseB to in1, expression `"in0 + in1"` throws type error
- [ ] Error message: "Cannot add phase + phase. Suggestion: Use 'phase + float' for offset."
- [ ] Wire float to in0, in1, expression `"in0 && in1"` throws error "Logical AND requires bool operands"
- [ ] Expression `"sin(true)"` throws error (if user creates bool constant somehow)
- [ ] Type error includes position of operator/function causing error
- [ ] Type error includes suggestion for fix (where applicable)

### 9. Error Handling - Undefined Identifier

**Deliverable:** Undefined inputs are caught and reported with available inputs

- [ ] No inputs wired, expression `"foo"` throws error "Undefined input 'foo'"
- [ ] Error lists available inputs: "Available inputs: (none wired)"
- [ ] Wire float to in0, expression `"phas"` suggests "Did you mean 'in0'?" (Levenshtein distance)
- [ ] Wire in0 and in2, expression `"in1"` errors "Undefined input 'in1'. Available: in0, in2"
- [ ] Error message helps user understand which inputs are available

### 10. Inspector UI - Expression Text Input

**Deliverable:** Expression text field appears in Inspector with proper styling

- [ ] Select Expression block → Inspector shows expression text field
- [ ] Text field is multi-line (min 3 rows)
- [ ] Text field uses monospace font (code style)
- [ ] Text field has 500 character limit with counter display
- [ ] User can type expression text and see config update in real-time
- [ ] Pressing Ctrl+Enter (or Cmd+Enter on Mac) triggers patch recompile

### 11. Inspector UI - Error Display

**Deliverable:** Compile errors appear inline in Inspector

- [ ] Invalid expression shows red border around text field
- [ ] Error message appears below text field in red text
- [ ] Error message includes position: "Error at position 12: ..."
- [ ] Error message includes suggestion if available
- [ ] Valid expression clears error state (red border removed, message hidden)
- [ ] Error updates after each recompile attempt

### 12. Diagnostics Integration

**Deliverable:** Expression errors appear in DiagnosticConsole

- [ ] Expression syntax error appears in DiagnosticConsole (Authoring stream)
- [ ] Expression type error appears in DiagnosticConsole
- [ ] Diagnostic entry shows error code ('ExprSyntaxError' or 'ExprTypeError')
- [ ] Diagnostic entry shows full error message with position
- [ ] Click on diagnostic focuses Expression block in patch editor
- [ ] Fixing error clears diagnostic from console
- [ ] Multiple Expression blocks with errors all show separate diagnostics

### 13. End-to-End Tests - Block Definition

**Deliverable:** Block definition tests pass

- [ ] Test: Expression block can be created programmatically
- [ ] Test: Block has correct input/output port configuration
- [ ] Test: Block has correct config parameter (expression text)
- [ ] Test: Block metadata is correct (form, capability, category)

### 14. End-to-End Tests - Lowering

**Deliverable:** Lowering tests verify IR structure

- [ ] Test: Literal expression `"42"` produces sigConst(42, int)
- [ ] Test: Binary op `"in0 + in1"` produces sigZip with Add opcode
- [ ] Test: Function call `"sin(in0)"` produces sigMap with Sin opcode
- [ ] Test: Complex expression produces correct nested IR structure
- [ ] Test: Syntax error is caught during lowering
- [ ] Test: Type error is caught during lowering
- [ ] Test: Undefined identifier error is caught during lowering

### 15. End-to-End Tests - Runtime

**Deliverable:** Runtime tests verify execution correctness

- [ ] Test: Expression `"42"` outputs constant 42 at runtime
- [ ] Test: Expression `"in0 * 2"` with input 5 outputs 10 at runtime
- [ ] Test: Expression `"sin(in0)"` with input 0 outputs 0 at runtime
- [ ] Test: Expression `"in0 + in1"` with inputs 3, 4 outputs 7 at runtime
- [ ] Test: Complex expression executes correctly over multiple frames
- [ ] Test: Boolean expressions (comparisons, ternary) execute correctly

### 16. Error Message Quality

**Deliverable:** Error messages are clear and actionable

- [ ] Review all error types (syntax, type, undefined, arity)
- [ ] Verify error messages use artist-friendly language (no jargon)
- [ ] Verify error messages explain WHAT, WHY, and HOW (suggestion)
- [ ] Verify position information is accurate (correct char offset)
- [ ] Verify suggestions are helpful (Levenshtein for typos, type hints)
- [ ] No error message uses terms like: AST, unification, payload, environment
- [ ] All error messages follow consistent format (see ERRORS.md)

### 17. Integration - No Regressions

**Deliverable:** Existing functionality unaffected

- [ ] All existing block tests pass
- [ ] All existing compiler tests pass
- [ ] All existing runtime tests pass
- [ ] Patch compilation time not significantly increased (<5% slower)
- [ ] Bundle size increased by <5 KB (no external dependencies added)
- [ ] No new type errors or warnings in codebase
- [ ] Existing math blocks (Add, Subtract, etc.) still work correctly

---

## Exit Criteria

**Sprint is COMPLETE when:**

1. All 17 acceptance criteria sections are fully checked off (all boxes ✅)
2. All P0 work items from PLAN are implemented and tested
3. All integration tests passing (100% pass rate)
4. Manual testing completed (create Expression block, type expression, verify output)
5. No known P0 bugs or blockers
6. Code reviewed and approved
7. Branch merged to main

**Sprint is BLOCKED if:**

- Expression DSL core is incomplete (Sprint 2 must finish first)
- Block registry API is unstable
- IRBuilder interface changes (unlikely - stable API)

---

## Out of Scope (Deferred)

The following are explicitly NOT required for this sprint:

### Deferred to Sprint 4 (Dynamic Inputs)

- [ ] Dynamic port creation based on expression parsing
- [ ] Custom port names/labels (user-defined)
- [ ] Port auto-wiring based on identifier names
- [ ] Expression variable renaming in UI

**Reason:** These require significant graph normalization changes and UI complexity. Fixed inputs (in0-in4) are simpler and sufficient for v1.

### Deferred to Future (UI Enhancements)

- [ ] Syntax highlighting in expression editor
- [ ] Auto-complete for function names
- [ ] Live type inference display (show output type as you type)
- [ ] Expression library/presets (save/load expressions)
- [ ] Code snippets for common patterns

**Reason:** Nice-to-have features that improve UX but are not essential for MVP. Can add based on user feedback.

### Deferred to Future (Advanced Features)

- [ ] Field expressions (only signal expressions for v1)
- [ ] Multi-output expressions (only single output for v1)
- [ ] User-defined functions
- [ ] Expression macros/templates
- [ ] Partial compilation/error recovery

**Reason:** Significant complexity, low user demand initially. Revisit after v1 adoption.

---

## Blockers and Questions

**None identified.** All dependencies are complete and stable.

If blockers arise during implementation, document them here and update the plan.

---

## Sign-Off

**Planner:** status-planner (2026-01-20 16:43:54)

**Implementer:** (TBD - sign off when sprint starts)

**Reviewer:** (TBD - sign off when sprint completes)

**Status:** READY FOR IMPLEMENTATION

---

## Related Documents

- `SPRINT-20260120-164354-integration-PLAN.md` - Full sprint plan
- `SPRINT-20260120-164354-integration-CONTEXT.md` - Implementation context
- `src/expr/GRAMMAR.md` - Expression grammar reference
- `src/expr/FUNCTIONS.md` - Built-in functions catalog
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type checking rules
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling strategy
