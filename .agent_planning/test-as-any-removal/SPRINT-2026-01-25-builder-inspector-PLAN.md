# Sprint: Builder & Inspector - Internal access patterns
**Generated:** 2026-01-25T07:30:32Z
**Status:** PARTIALLY READY
**Confidence:** HIGH: 0, MEDIUM: 2, LOW: 0
**Expected Effort:** 1-2 hours (includes design clarification)

## Sprint Goal
Remove 19 'as any' casts by resolving internal builder and inspector access patterns through explicit API design.

## Scope
**Deliverables:**
- Fix internal builder access (10 instances) - requires SigRef design decision
- Fix CompilationInspector output access (9 instances) - requires pass output typing approach

## Work Items

### Item 1: Internal builder access (10 instances) - MEDIUM CONFIDENCE
**Files affected:** expression-blocks.test.ts
**Pattern:** `(outputRef as any).id` and `builder['sigExprs'][sigId as any]`

**Current situation:**
Tests need to access IRBuilder internals:
- `SigRef` type is typed but doesn't expose `id` property
- Tests verify IR structure for correctness

**Design options:**

#### Option A: Add id property to SigRef (RECOMMENDED)
```typescript
export interface SigRef {
  id: SigExprId;  // Add this
  // ... existing properties
}
```
**Pros:** Type-safe, forward-compatible, explicit API
**Cons:** Slightly larger type, but it's already containing this info

#### Option B: Type-safe test accessor
```typescript
export function getSigRefId(ref: SigRef): SigExprId {
  return (ref as any).id;
}
```
**Pros:** Keeps internal structure private
**Cons:** Shifts cast to library, still not solved

#### Option C: Discriminated union on output
```typescript
type OutputRef = { kind: 'sig', id: SigExprId } | { kind: 'field', ... };
```
**Pros:** Cleaner modeling
**Cons:** More complex, bigger refactor

**Recommendation:** Option A - Add id property to SigRef

**Unknown to resolve:**
- [ ] What is the design intent of SigRef? (Is id always available?)
- [ ] Do tests need read-only access or is any access OK?
- [ ] Are there other places that should access ref.id?

**Acceptance Criteria (after design decision):**
- [ ] SigRef design clarified and chosen approach documented
- [ ] All 10 instances in expression-blocks.test.ts replaced
- [ ] Tests pass with proper typing
- [ ] No remaining 'as any' for builder internals

### Item 2: CompilationInspector output access (9 instances) - MEDIUM CONFIDENCE
**Files affected:** CompilationInspectorService.test.ts
**Pattern:** `snapshot?.passes[0].output as any` accessing heterogeneous pass outputs

**Current situation:**
- Compilation passes produce different output types (IR, arrays, diagnostics, etc.)
- InspectionSnapshot stores these as `unknown` since they vary by pass
- Tests need to access pass outputs with type information

**Design options:**

#### Option A: Generic accessor with type parameter (RECOMMENDED)
```typescript
export interface InspectionSnapshot {
  getPassOutput<T>(passName: string, index?: number): T | undefined;
}
```
Usage:
```typescript
const ast = snapshot.getPassOutput<ProgramAST>('parse');
expect(ast.kind).toBe('program');
```

**Pros:** Type-safe, clear intent, discoverable
**Cons:** Requires maintaining mapping of pass names to types

#### Option B: Type discriminated union
```typescript
type PassOutput =
  | { kind: 'ast', ast: ProgramAST }
  | { kind: 'ir', ir: ProgramIR }
  | { kind: 'diagnostics', diags: Diagnostic[] };
```
**Pros:** All types known upfront
**Cons:** Tight coupling, harder to extend

#### Option C: Accept `as unknown as T` (pragmatic)
```typescript
(snapshot.passes[0].output as unknown as T)
```
**Pros:** Minimal code change
**Cons:** Still uses cast, just more explicit

**Recommendation:** Option A - Generic accessor provides better API

**Unknowns to resolve:**
- [ ] What are all the pass types? (parse, IR generation, scheduling, etc.)
- [ ] Is there a stable pass name registry?
- [ ] Do tests only care about specific passes or all of them?

**Acceptance Criteria (after design decision):**
- [ ] CompilationInspector API clarified
- [ ] All 9 instances in test updated
- [ ] Tests pass with proper typing
- [ ] No remaining 'as any' for pass outputs

## Dependencies
- Item 1 and Item 2 are independent
- Both require brief design clarification before implementation

## Risks
- **Risk:** Design decision might affect existing APIs
  - **Mitigation:** Changes are test-facing only, no impact on main codebase
  - **Mitigation:** Can always add new methods without removing old ones

- **Risk:** Changes might require updates to related code
  - **Mitigation:** Grep for builder/inspector usage to identify all affected files

## Next Steps
**This sprint requires user input** on the design choices above:
1. For SigRef: Use Option A (add id property)?
2. For CompilationInspector: Use Option A (generic accessor)?

Once design is confirmed, implementation is straightforward mechanical replacement.
