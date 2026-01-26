# Definition of Done: suggestion-provider

Generated: 2026-01-26-030000
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260126-030000-suggestion-provider-PLAN.md

## Acceptance Criteria

### Suggestion Data Types

- [ ] `Suggestion` interface defined with label, type, description, sortOrder
- [ ] `SuggestionType` discriminated union (function, input, block, port)
- [ ] `FunctionSuggestion` with arity, returnType, description
- [ ] `InputSuggestion` with connected status
- [ ] `BlockSuggestion` with port count metadata
- [ ] `PortSuggestion` with payload type and cardinality
- [ ] Types exported from `src/expr/suggestions.ts`
- [ ] Unit tests for all type definitions

### Function Signatures Export

- [ ] `getFunctionSignatures()` accessor function created
- [ ] Exported from `src/expr/typecheck.ts` or `src/expr/index.ts`
- [ ] Each function includes: name, arity, return type, description
- [ ] Suggestions include opening paren: "sin(" not "sin"
- [ ] All 16 expression functions covered
- [ ] Unit tests verify function export
- [ ] No breaking changes to existing typecheck API

### SuggestionProvider Service

- [ ] `SuggestionProvider` class created in `src/expr/suggestions.ts`
- [ ] Constructor: `(patch: Patch, registry: AddressRegistry)`
- [ ] `suggestFunctions()` returns all functions sorted by sortOrder
- [ ] `suggestInputs()` returns in0-in4 as suggestions
- [ ] `suggestBlocks()` returns block names from registry
- [ ] `suggestBlockPorts(blockName)` returns ports for specific block
- [ ] `filterSuggestions(prefix, type?)` fuzzy filters results
- [ ] All methods return readonly arrays
- [ ] Unit tests for each method
- [ ] Integration test with real patch and registry

### Fuzzy Filtering

- [ ] Filter handles empty prefix (returns all)
- [ ] Case-insensitive substring matching
- [ ] Results sorted by match quality then sortOrder
- [ ] Edge cases tested: special characters, numbers, empty input
- [ ] Unit tests cover filter scenarios

### Integration Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all new tests)
- [ ] No circular dependencies
- [ ] Exported from `src/expr/index.ts`
- [ ] Ready for use by AutocompleteDropdown component

### Documentation

- [ ] JSDoc on `Suggestion` interface
- [ ] JSDoc on `SuggestionProvider` class
- [ ] JSDoc on each public method
- [ ] Inline comments explaining sort order and filter ranking
