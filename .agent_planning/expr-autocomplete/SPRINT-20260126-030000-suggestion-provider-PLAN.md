# Sprint: suggestion-provider - Expression Autocomplete Data Service

Generated: 2026-01-26-030000
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Build the data service (`SuggestionProvider`) that collects and filters autocomplete suggestions from functions, inputs, and block references. This service powers all autocomplete features.

## Scope

**Deliverables:**
- `SuggestionProvider` class - single entry point for all suggestion queries
- Built-in function suggestions from Expression DSL
- Input variable suggestions (in0-in4)
- Block reference suggestions from AddressRegistry
- Fuzzy filtering and ranking algorithm
- Comprehensive unit tests

## Work Items

### P0: Suggestion Data Types [HIGH]

**Acceptance Criteria:**
- [ ] `Suggestion` interface defined with: `label`, `type`, `description`, `sortOrder`
- [ ] `SuggestionType` discriminated union: `'function' | 'input' | 'block' | 'port'`
- [ ] `FunctionSuggestion` with `label` (e.g., "sin("), `arity`, `returnType`, `description`
- [ ] `InputSuggestion` with label, connected status, port position
- [ ] `BlockSuggestion` with block name, port count, optional displayName
- [ ] `PortSuggestion` with port name, payload type, cardinality
- [ ] Export types from `src/expr/suggestions.ts`
- [ ] Unit tests for type definitions

**Technical Notes:**
```typescript
interface Suggestion {
  readonly label: string;
  readonly type: SuggestionType;
  readonly description?: string;
  readonly sortOrder: number; // 0-1000 for ranking
  readonly metadata?: Record<string, unknown>;
}

type SuggestionType = 'function' | 'input' | 'block' | 'port';
```

---

### P1: Export Built-in Function Signatures [HIGH]

**Acceptance Criteria:**
- [ ] Export function list from `src/expr/typecheck.ts` (currently module-private)
- [ ] Create `getFunctionSignatures(): readonly FunctionSignature[]`
- [ ] Each function has: name, arity, return type, description
- [ ] Suggestions include opening paren: `"sin("` not just `"sin"`
- [ ] Unit tests for function signature export
- [ ] No breaking changes to existing typecheck module

**Technical Notes:**
- `FUNCTION_SIGNATURES` is defined at line 82 in typecheck.ts
- Currently used only in typecheck - safe to export
- Add accessor function rather than exporting raw const

---

### P2: SuggestionProvider Service [HIGH]

**Acceptance Criteria:**
- [ ] `SuggestionProvider` class with single constructor: `(patch, addressRegistry)`
- [ ] Method: `suggestFunctions(): Suggestion[]` - sorted list of all functions
- [ ] Method: `suggestInputs(): Suggestion[]` - in0-in4 suggestions
- [ ] Method: `suggestBlocks(): Suggestion[]` - block names from registry
- [ ] Method: `suggestBlockPorts(blockName): Suggestion[]` - ports for a block
- [ ] Method: `filterSuggestions(prefix, type?): Suggestion[]` - fuzzy filter
- [ ] Each suggestion has appropriate sortOrder (functions: 100, inputs: 200, blocks: 300)
- [ ] Unit tests for all methods

**Technical Notes:**
```typescript
class SuggestionProvider {
  constructor(
    readonly patch: Patch,
    readonly registry: AddressRegistry
  ) {}

  suggestFunctions(): readonly Suggestion[] { /* ... */ }
  suggestInputs(): readonly Suggestion[] { /* ... */ }
  suggestBlocks(): readonly Suggestion[] { /* ... */ }
  suggestBlockPorts(blockName: string): readonly Suggestion[] { /* ... */ }
  filterSuggestions(prefix: string, type?: SuggestionType): readonly Suggestion[] { /* ... */ }
}
```

---

### P3: Fuzzy Filtering Algorithm [HIGH]

**Acceptance Criteria:**
- [ ] Filter implementation: simple substring match or fuzzy
- [ ] Case-insensitive matching
- [ ] Preserve sortOrder from base suggestions
- [ ] Return suggestions sorted by (match quality, sortOrder)
- [ ] Handle empty prefix (return all, sorted)
- [ ] Unit tests for filtering edge cases

**Technical Notes:**
- Simple substring match is sufficient for expression editor
- Examples: "sin" matches "sin(", "asin(", etc.
- "rad" matches "radians", "add_radians", etc.
- Maintain sortOrder ranking within matching results

---

## Dependencies

- Sprint 3 (Expression DSL Extension) COMPLETED - block references exist
- Sprint 1 (Canonical Addressing) COMPLETED - AddressRegistry available
- Patch model available (`src/graph/Patch.ts`)

## Risks

| Risk | Mitigation |
|------|------------|
| Function signatures not exported | Create accessor function, no breaking changes |
| Port enumeration performance | AddressRegistry is O(1), no hot loops |
| Suggestion data duplication | Store in-memory, invalidate on patch change |

## Integration Points

- Consumed by: AutocompleteDropdown component (Sprint 2)
- Data source: Expression DSL functions, AddressRegistry, Patch
- No coupling to UI framework
