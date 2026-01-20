# Definition of Done: Integration Sprint

Generated: 2026-01-20 11:03:00
Confidence: HIGH (after core implementation completes)
Plan: SPRINT-20260120-110300-integration-PLAN.md

## Acceptance Criteria

### Expression Block Implementation

- [ ] Create `src/blocks/expression-block.ts`
- [ ] Register block with type `'Expression'`, category `'signal'`
- [ ] Block has expression string as config parameter (not a port)
- [ ] Block has dynamic inputs based on parsed identifiers
- [ ] Block output type matches expression result type
- [ ] Lower function calls `compileExpression()` and returns SigExprId
- [ ] Handle compilation errors gracefully (convert to CompileError)
- [ ] Include 10+ tests for block lowering
- [ ] Test error cases (syntax error, type error, etc.)

### Expression Input UI Component

- [ ] Create `src/ui/components/params/ExpressionInput.tsx`
- [ ] Component accepts: value (string), onChange, inputTypes
- [ ] Shows multiline text input
- [ ] Validates expression on change
- [ ] Displays syntax/type errors inline with position
- [ ] Errors show helpful message and suggestion
- [ ] Integration test with Block Inspector
- [ ] Styling matches existing param controls

### End-to-End Integration Tests

- [ ] Create `src/blocks/__tests__/expression-integration.test.ts`
- [ ] Test: Create Expression block, compile patch, verify IR
- [ ] Test: Expression with single input (e.g., "phase * 2")
- [ ] Test: Expression with multiple inputs (e.g., "a + b")
- [ ] Test: Expression with function call (e.g., "sin(phase)")
- [ ] Test: Expression with ternary (e.g., "x > 0 ? 1 : -1")
- [ ] Test: Syntax error produces CompileError
- [ ] Test: Type error produces CompileError
- [ ] Test: Runtime execution produces correct values
- [ ] All tests pass

### User Documentation

- [ ] Create `docs/user/expression-block.md` or integrate into existing docs
- [ ] Explain what Expression block does (simple math in text)
- [ ] Provide syntax quick reference (operators, functions)
- [ ] Include 10+ examples (simple to complex)
- [ ] Explain common errors and how to fix
- [ ] Include screenshots of Expression block in use
- [ ] Link to full grammar/function docs for advanced users

### Block Library Integration

- [ ] Expression block appears in block library under 'signal' category
- [ ] Block can be added to patch via UI
- [ ] Block inspector shows expression input
- [ ] Block inspector shows dynamic inputs
- [ ] Block can be wired to other blocks
- [ ] Expression compilation errors appear in diagnostics panel
- [ ] Manual testing: Create patch with Expression block, verify it works

## Exit Criteria

This sprint successfully completes when:

- [ ] Expression block fully functional in UI
- [ ] Artists can create patches using Expression block
- [ ] End-to-end workflow works: type expression → wire inputs → compile → execute
- [ ] Errors provide helpful feedback
- [ ] Documentation guides users on how to use feature
- [ ] All tests pass (unit + integration + manual)
- [ ] Feature ready for user testing

## Prerequisites (BLOCKERS)

**MUST complete core implementation sprint first:**
- ✅ `compileExpression()` API exists and works
- ✅ Parser, type checker, compiler all implemented
- ✅ Unit tests pass
- ✅ Documentation complete

This sprint CANNOT start until core implementation deliverables exist.

## Deferred Work

The following items are explicitly OUT OF SCOPE for this sprint:

- **Advanced UI Features** - Autocomplete, syntax highlighting, live preview (future enhancement)
- **Vec2/Color Support** - Vector and color expressions (deferred to future)
- **Custom Functions** - User-defined functions (deferred to future, may never implement)
- **Error Recovery UI** - Advanced error recovery (e.g., suggest fixes inline) (future enhancement)
- **Performance Optimization** - Expression compilation caching (defer until proven needed)

## Deliverable Files

Expected outputs from this sprint:

**Source Files:**
- `src/blocks/expression-block.ts` - Expression block implementation

**UI Files:**
- `src/ui/components/params/ExpressionInput.tsx` - Expression input component

**Test Files:**
- `src/blocks/__tests__/expression-block.test.ts` - Block unit tests
- `src/blocks/__tests__/expression-integration.test.ts` - Integration tests

**Documentation:**
- `docs/user/expression-block.md` - User guide

## Verification

To verify this sprint is complete:

1. **Functionality:**
   - Open app in browser
   - Add Expression block to patch
   - Type `"sin(phase * 2) + 0.5"`
   - Connect phase input
   - Run patch → should see output

2. **Error Handling:**
   - Type invalid expression `"sin(phase +"`
   - Should see syntax error in inspector
   - Type type error `"phase + phase"`
   - Should see type error

3. **Tests:**
   - Run `npm test src/blocks -- expression`
   - All tests pass

4. **Integration:**
   - Compile patch with Expression block
   - Verify IR contains correct SigExpr nodes
   - Execute runtime
   - Verify output values correct

5. **Documentation:**
   - Read user docs
   - Follow quick start example
   - Verify examples work

## Success Metrics

**Minimum Viable Feature:**
- [ ] Expression block exists and works
- [ ] Can type simple expressions
- [ ] Syntax/type errors show helpful messages
- [ ] Runtime executes expressions correctly

**Quality Bar:**
- [ ] All tests pass
- [ ] Test coverage >80% for new code
- [ ] No TypeScript errors
- [ ] Documentation complete and clear
- [ ] Manual testing successful

**User Experience:**
- [ ] Typing expression feels natural
- [ ] Errors are understandable
- [ ] Common use cases work smoothly
- [ ] Performance acceptable (no lag on typing)
