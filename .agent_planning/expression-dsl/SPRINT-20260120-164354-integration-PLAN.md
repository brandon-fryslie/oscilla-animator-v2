# Sprint: Integration - Wire Expression DSL into Application

**Generated:** 2026-01-20 16:43:54
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION
**Source:** EVALUATION-20260120-110100.md

## Sprint Goal

Integrate the completed Expression DSL (lexer, parser, type checker, IR compiler) into the Oscilla application so users can create Expression blocks, type mathematical expressions, and see them compile to IR and execute at runtime.

## Prerequisites

- ✅ Sprint 1 (Research) COMPLETE - Grammar, type rules, error handling, parser decision documented
- ✅ Sprint 2 (Core Implementation) COMPLETE - Lexer, parser, type checker, IR compiler implemented with 64/64 tests passing
- ✅ Expression DSL isolated in `src/expr/` with public API: `compileExpression(text, inputs, builder, inputSignals)`

## Scope

### Deliverables

1. **Expression Block Definition** - New block type in `src/blocks/` with fixed inputs and expression parameter
2. **Block Lowering** - Compile expression text to IR using `compileExpression()` API
3. **UI Integration** - Expression text input in Block Inspector with error display
4. **End-to-End Tests** - Verify expression compilation and execution flow
5. **Error Handling** - Display compile errors in UI (Inspector + Diagnostics)

### Explicitly Out of Scope (Future Work)

- Dynamic input port creation (Sprint 4 or later)
- Syntax highlighting in expression editor
- Auto-complete for function names
- Expression library/presets
- Field expressions (signal expressions only for v1)
- Multi-output expressions

## Architecture Decisions

### 1. Input Port Design: FIXED INPUTS

**Decision:** Use fixed optional input ports (in0, in1, in2, in3, in4) for v1.

**Rationale:**
- Simplest to implement - no dynamic port creation
- Avoids complexity in graph normalization
- Blocks have stable interface
- Compatible with existing block system

**Trade-off:** User must wire inputs to fixed ports, expression uses `in0`, `in1`, etc. as identifiers.

**Future:** Sprint 4 can add dynamic port creation if user feedback demands it.

### 2. Output Type: INFERRED DURING LOWERING

**Decision:** Output type is `canonicalType('???')` in block definition, resolved during lowering via type checking.

**Rationale:**
- Type checker determines actual output type (`sin(x)` → float, `x > 0` → bool)
- Block definition cannot know output type without parsing expression
- Polymorphic type `'???'` is already supported in type system

**Implementation:** Block lowering calls `compileExpression()`, which returns typed `SigExprId`. Use that type for output.

### 3. Error Handling: INLINE + DIAGNOSTICS

**Decision:** Show errors in BOTH places:
- **Inline:** Red border + error message below text field in Inspector
- **Diagnostics:** Full error in DiagnosticConsole (Authoring stream)

**Rationale:**
- Inline: Immediate feedback at edit location
- Diagnostics: Consistent with other compile errors, more space for details

**Implementation:** Block lowering throws `CompileError` with expression error details. UI catches and displays inline.

### 4. Validation Timing: ON COMPILE (NOT ON KEYSTROKE)

**Decision:** Expression is validated during patch compilation (when user presses Play or system recompiles), not on every keystroke.

**Rationale:**
- Simpler implementation - no debouncing, no partial state
- Consistent with rest of system (compile-time validation)
- User can type incomplete expressions without error spam

**Future:** Could add debounced live validation in Sprint 4 if desired.

### 5. Identifier Mapping: FIXED NAMING (in0, in1, in2, ...)

**Decision:** Input ports are named `in0`, `in1`, `in2`, `in3`, `in4`. Expression uses these exact names as identifiers.

**Rationale:**
- Deterministic mapping (no ambiguity)
- No custom naming UI needed
- Simple to explain to users

**Example:**
- Wire `PhaseA` to `in0`, `Radius` to `in1`
- Expression: `sin(in0 * 2) * in1`

**Future:** Could add port labels or allow custom names in Sprint 4.

## Work Items

### P0: Expression Block Definition

**Dependencies:** None
**Spec Reference:** ESSENTIAL-SPEC.md (Block System), EVALUATION-20260120-110100.md
**Status Reference:** Sprint 2 complete - `compileExpression()` API ready

#### Description

Create a new block type `'Expression'` in `src/blocks/math-blocks.ts` (or new `src/blocks/expression-blocks.ts`).

**Block Configuration:**
- Type: `'Expression'`
- Category: `'math'`
- Form: `'primitive'`
- Capability: `'pure'`
- Label: `'Expression'`
- Description: `'Compute signal from mathematical expression'`

**Inputs (5 optional ports):**
- `in0`: `{ label: 'In 0', type: canonicalType('???'), optional: true }`
- `in1`: `{ label: 'In 1', type: canonicalType('???'), optional: true }`
- `in2`: `{ label: 'In 2', type: canonicalType('???'), optional: true }`
- `in3`: `{ label: 'In 3', type: canonicalType('???'), optional: true }`
- `in4`: `{ label: 'In 4', type: canonicalType('???'), optional: true }`

**Config Parameter (not a port):**
- `expression`: `{ label: 'Expression', type: canonicalType('???'), exposedAsPort: false, value: '', uiHint: { control: 'text', multiline: true } }`

**Outputs:**
- `out`: `{ label: 'Output', type: canonicalType('???') }`

**Notes:**
- Use polymorphic type `'???'` because actual types are unknown until expression is parsed
- `optional: true` allows unwired inputs (treated as unavailable in expression)
- `exposedAsPort: false` for expression parameter (config-only, not wirable)

#### Acceptance Criteria

- [ ] Expression block registered in block registry
- [ ] Block appears in block palette under "Math" category
- [ ] Block can be added to patch via UI
- [ ] Block has 5 input ports (in0-in4) and 1 output port (out)
- [ ] Expression config parameter shows in Inspector (text field)
- [ ] Block compiles without errors when expression is empty (default: output constant 0)

#### Technical Notes

Use existing math blocks (Add, Subtract, etc.) as template. Follow same pattern for `registerBlock()` call.

---

### P0: Block Lowering Implementation

**Dependencies:** P0 Expression Block Definition
**Spec Reference:** GRAMMAR.md, TYPE-RULES.md, ERRORS.md
**Status Reference:** `compileExpression()` API in `src/expr/index.ts`

#### Description

Implement the `lower` function for Expression block to compile expression text to IR.

**Algorithm:**
1. Read `expression` text from `config.expression`
2. Build input type map from wired inputs (check which of in0-in4 are connected)
3. Build input signal map from `inputsById`
4. Call `compileExpression(exprText, inputTypes, builder, inputSignals)`
5. If compilation succeeds: return output signal
6. If compilation fails: throw `CompileError` with expression error details

**Edge Cases:**
- Empty expression → return `sigConst(0, canonicalType('float'))`
- Undefined identifier in expression → error lists available inputs (in0-in4 that are wired)
- No inputs wired → expression can only use literals and functions
- Type mismatch → error from type checker

**Error Conversion:**
```typescript
if (!result.ok) {
  throw new Error(`Expression compile error: ${result.error.message}`);
}
```

#### Acceptance Criteria

- [ ] Empty expression compiles to constant 0 (float)
- [ ] Expression `"42"` compiles to constant 42 (int)
- [ ] Expression `"in0 * 2"` compiles correctly when in0 is wired
- [ ] Expression `"in0 + in1"` compiles correctly when both inputs wired
- [ ] Expression `"sin(in0)"` compiles to Sin opcode
- [ ] Expression with syntax error throws compile error with message
- [ ] Expression with type error throws compile error with message
- [ ] Expression referencing unwired input throws error listing available inputs
- [ ] Output type matches expression type (float for `sin(x)`, bool for `x > 0`, etc.)

#### Technical Notes

Study existing block lowering functions in `src/blocks/math-blocks.ts` for pattern. Use IRBuilder methods: `sigConst`, `sigMap`, `sigZip`, `opcode`.

---

### P0: Inspector UI - Expression Text Input

**Dependencies:** None (UI is independent of lowering)
**Spec Reference:** ERRORS.md (Error Message Format)
**Status Reference:** BlockInspector.tsx exists with config param UI system

#### Description

Add Expression block support to `BlockInspector.tsx` to display expression text input with error handling.

**UI Components:**
- Multi-line text field for expression editing (use existing `MuiTextInput` with `multiline: true`)
- Error display below text field (red text, error message from compile error)
- Character limit: 500 chars (prevent performance issues)

**Behavior:**
- User edits expression text
- On blur or patch recompile: validate expression
- If error: show inline error message, red border
- If valid: clear error state

**Integration Points:**
- Detect Expression block type in `renderBlockParams()`
- Render custom expression input instead of generic config param UI
- Extract error from compile error if present
- Update `config.expression` on text change

**Styling:**
- Use monospace font for expression text (code style)
- Multi-line field with min-height (3 rows)
- Red border when error present
- Error message in red text below field

#### Acceptance Criteria

- [ ] Expression block shows multi-line text input in Inspector
- [ ] User can type expression text and see it update in real-time
- [ ] Invalid expression shows red border around text field
- [ ] Invalid expression shows error message below text field
- [ ] Error message includes position and suggestion (from ExpressionCompileError)
- [ ] Valid expression clears error state
- [ ] Text field uses monospace font
- [ ] Text field has 500 character limit with counter
- [ ] Pressing Ctrl+Enter in text field triggers recompile

#### Technical Notes

Check `uiHint.control === 'text'` to detect expression parameter. Use existing `MuiTextInput` component with `error` and `helperText` props.

---

### P1: Diagnostics Integration

**Dependencies:** P0 Block Lowering
**Spec Reference:** 07-diagnostics-system.md
**Status Reference:** DiagnosticConsole exists in UI

#### Description

Wire expression compile errors into the DiagnosticConsole so they appear in the Authoring stream.

**Implementation:**
- When block lowering throws expression compile error, catch it in compiler
- Convert to diagnostic message with:
  - **Code:** `'ExprSyntaxError'` | `'ExprTypeError'` | `'ExprCompileError'`
  - **Message:** Full error message from expression compiler
  - **Target:** Block ID (Expression block that failed)
  - **Severity:** Error
  - **Stream:** Authoring

**Error Format:**
```typescript
{
  code: 'ExprSyntaxError',
  message: 'Syntax error at position 12: Expected expression after "*"',
  target: { blockId: 'block_123' },
  severity: 'error',
  timestamp: Date.now(),
}
```

#### Acceptance Criteria

- [ ] Expression syntax error appears in DiagnosticConsole
- [ ] Expression type error appears in DiagnosticConsole
- [ ] Click on diagnostic focuses Expression block in patch editor
- [ ] Diagnostic message includes position information
- [ ] Diagnostic message includes suggestion if available
- [ ] Fixing error clears diagnostic from console
- [ ] Multiple expression errors (if multiple Expression blocks) all appear

#### Technical Notes

Follow existing pattern in compiler for emitting diagnostics. See `src/compiler/passes-v2/` for examples.

---

### P0: End-to-End Integration Tests

**Dependencies:** P0 Block Definition, P0 Block Lowering, P0 Inspector UI
**Spec Reference:** GRAMMAR.md, FUNCTIONS.md
**Status Reference:** Test infrastructure exists

#### Description

Write end-to-end tests that create Expression blocks, compile patches, and verify IR + runtime output.

**Test Scenarios:**

1. **Literal Expression:**
   - Create Expression block with `"42"`
   - Verify output is constant 42 (int)

2. **Simple Math:**
   - Wire Const(0.5) to in0
   - Expression: `"in0 * 2"`
   - Verify output is 1.0 (float)

3. **Function Call:**
   - Wire PhaseA to in0
   - Expression: `"sin(in0)"`
   - Verify output is sine wave (float)

4. **Binary Operation:**
   - Wire Const(3) to in0, Const(4) to in1
   - Expression: `"in0 + in1"`
   - Verify output is 7 (int)

5. **Complex Expression:**
   - Wire PhaseA to in0
   - Expression: `"sin(in0 * 2) * 0.5 + 0.5"`
   - Verify output oscillates between 0 and 1

6. **Syntax Error:**
   - Expression: `"in0 +"`
   - Verify compile error thrown with message

7. **Type Error:**
   - Wire PhaseA to in0, PhaseB to in1
   - Expression: `"in0 + in1"`
   - Verify type error (cannot add phase + phase)

8. **Undefined Identifier:**
   - No inputs wired
   - Expression: `"foo * 2"`
   - Verify error: "Undefined input 'foo'"

**Test Files:**
- `src/blocks/__tests__/expression-block.test.ts` - Block definition tests
- `src/compiler/__tests__/expression-integration.test.ts` - Lowering tests
- `src/runtime/__tests__/expression-runtime.test.ts` - Runtime execution tests

#### Acceptance Criteria

- [ ] Test: Literal expression compiles and executes correctly
- [ ] Test: Simple math expression (in0 * 2) compiles and executes
- [ ] Test: Function call (sin(in0)) compiles to Sin opcode
- [ ] Test: Binary operation (in0 + in1) compiles to Add opcode
- [ ] Test: Complex expression with multiple operations compiles
- [ ] Test: Syntax error is caught and reported
- [ ] Test: Type error is caught and reported
- [ ] Test: Undefined identifier error is caught and reported
- [ ] All tests pass with 100% coverage of integration paths
- [ ] Tests verify actual IR structure (not just that compilation succeeds)

#### Technical Notes

Use existing test infrastructure from Sprint 2 (`src/expr/__tests__/`) as reference. Follow existing integration test patterns in `src/compiler/__tests__/`.

---

### P1: Error Message Quality

**Dependencies:** P0 Block Lowering, P1 Diagnostics Integration
**Spec Reference:** ERRORS.md (Error Message Guidelines)
**Status Reference:** Error handling implemented in Sprint 2

#### Description

Verify that error messages are clear, actionable, and user-friendly. Polish error text based on actual usage.

**Review Criteria:**
- Error explains WHAT went wrong (not just "syntax error")
- Error explains WHY it's wrong (type mismatch, undefined identifier)
- Error suggests HOW to fix (if obvious)
- Error includes position information (character offset)
- Error uses artist-friendly language (not compiler jargon)

**Example Improvements:**

❌ Bad: "Operator '+' not defined for PayloadType::Phase × PayloadType::Phase"
✅ Good: "Cannot add phase + phase. Suggestion: Use 'phase + float' for offset."

❌ Bad: "Identifier 'phas' not found in environment."
✅ Good: "Undefined input 'phas'. Did you mean 'phase'? Available inputs: in0 (phase), in1 (float)"

**Testing:**
- Manually trigger each error type
- Read error message aloud
- Verify it makes sense without looking at code
- Check that suggestion helps

#### Acceptance Criteria

- [ ] Syntax error messages are clear and specific
- [ ] Type error messages explain incompatibility and suggest fix
- [ ] Undefined identifier errors list available inputs
- [ ] Arity errors show expected vs actual argument count
- [ ] Function errors suggest similar function names (Levenshtein distance)
- [ ] All error messages follow consistent format (see ERRORS.md)
- [ ] No jargon (AST, unification, etc.) in user-facing errors
- [ ] Position information is accurate (correct character offset)

#### Technical Notes

Error messages were drafted in Sprint 1 (ERRORS.md). This task is validation and polish, not implementation.

---

### P2: Documentation

**Dependencies:** P0 Block Definition, P0 Block Lowering
**Spec Reference:** GRAMMAR.md, FUNCTIONS.md
**Status Reference:** Grammar and functions documented in Sprint 1

#### Description

Add user-facing documentation for Expression blocks:
- How to use Expression blocks (tutorial)
- Grammar reference (what syntax is supported)
- Function reference (list of built-in functions)
- Example expressions (common patterns)
- Troubleshooting (common errors and fixes)

**Documentation Location:**
- `docs/expression-dsl.md` (new file)
- Link from Block Inspector (help icon?)

**Content:**
1. **Quick Start:** Add Expression block, wire inputs, type expression, see result
2. **Grammar:** Operators, precedence, function calls
3. **Built-in Functions:** List from FUNCTIONS.md with examples
4. **Examples:** Sin wave, normalization, conditional, smoothstep
5. **Troubleshooting:** Common errors and solutions

#### Acceptance Criteria

- [ ] Documentation file created in `docs/expression-dsl.md`
- [ ] Quick start section with screenshots/examples
- [ ] Grammar section copied from GRAMMAR.md (user-friendly version)
- [ ] Function reference copied from FUNCTIONS.md
- [ ] At least 5 example expressions with explanations
- [ ] Troubleshooting section with 5 common errors
- [ ] Documentation reviewed for clarity (no jargon)

#### Technical Notes

Defer to Sprint 4 if time is tight. Not blocking for MVP.

---

## Dependencies

**Prerequisite Work:**
- ✅ Expression DSL core implementation (Sprint 2)
- ✅ Block registry system
- ✅ IR builder interface
- ✅ Block Inspector UI
- ✅ DiagnosticConsole

**Dependency Graph:**
```
P0 Expression Block Definition
  ↓
P0 Block Lowering ────────→ P0 End-to-End Tests
  ↓                              ↓
P1 Diagnostics Integration       ↓
  ↓                              ↓
P1 Error Message Quality ←───────┘
  ↓
P2 Documentation
```

**No External Blockers:** All dependencies exist and are ready.

---

## Risks

### Low Risk

- ✅ Expression DSL core is complete and tested (64/64 tests passing)
- ✅ Public API (`compileExpression()`) is stable and isolated
- ✅ Block system supports config-only parameters (recent work)
- ✅ Polymorphic type `'???'` already supported

### Medium Risk

- ⚠️ **User Confusion:** Fixed input names (in0, in1, etc.) may be confusing
  - **Mitigation:** Clear documentation, examples in Inspector
  - **Future:** Sprint 4 can add custom port labels

- ⚠️ **Error Display UX:** Inline errors in Inspector may be cramped
  - **Mitigation:** Also show in DiagnosticConsole for full context
  - **Future:** Could add syntax highlighting with error spans (CodeMirror)

### High Risk

- ❌ None identified

---

## Validation

### Functionality Validation

1. **Manual Testing:**
   - Create Expression block in patch
   - Wire inputs, type expression, verify output
   - Trigger each error type, verify messages
   - Test 10+ example expressions (from FUNCTIONS.md)

2. **Automated Testing:**
   - Run all integration tests (P0 requirement)
   - Verify 100% test coverage for integration paths

### Performance Validation

1. **Compilation Speed:**
   - Measure time to compile typical expressions (<1ms)
   - Verify no performance regression in patch compilation

2. **Bundle Size:**
   - Verify Expression DSL adds <5 KB to bundle (no external dependencies)

### User Experience Validation

1. **Error Quality:**
   - Test with non-technical user
   - Verify error messages are understandable
   - Collect feedback on clarity

2. **Workflow:**
   - Time to create first working Expression block (should be <1 min)
   - Identify friction points

---

## Success Metrics

**Sprint Complete When:**
- [ ] Expression block can be added to patch
- [ ] User can type expression and see it compile to IR
- [ ] Valid expressions execute correctly at runtime
- [ ] Invalid expressions show clear error messages
- [ ] All P0 acceptance criteria met
- [ ] All integration tests passing
- [ ] No regressions in existing functionality

**Definition of Done (see DOD file):**
- All acceptance criteria checked off
- Tests passing
- Code reviewed
- Documentation updated
- No known blockers for user adoption

---

## Related Documents

- `SPRINT-20260120-164354-integration-DOD.md` - Definition of Done
- `SPRINT-20260120-164354-integration-CONTEXT.md` - Implementation Context
- `src/expr/GRAMMAR.md` - Expression grammar (frozen)
- `src/expr/FUNCTIONS.md` - Built-in functions catalog
- `.agent_planning/expression-dsl/TYPE-RULES.md` - Type inference rules
- `.agent_planning/expression-dsl/ERRORS.md` - Error handling strategy
- `EVALUATION-20260120-110100.md` - Current state evaluation

---

## Version History

- **2026-01-20 16:43:54:** Initial sprint plan (Sprint 3: Integration)
  - HIGH confidence (all dependencies complete)
  - 6 work items (4 P0, 2 P1, 1 P2)
  - Fixed input design (in0-in4) for v1 simplicity
  - Inline + Diagnostics error display
