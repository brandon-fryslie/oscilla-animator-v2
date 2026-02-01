# Gap Analysis: Naming Conventions & Legacy Type Cleanup - TO REVIEW

## Summary
Items that are technically compliant but could benefit from user review for potential improvements.

---

## R1: Debug/Test Code Uses `.kind === 'signal'/'field'/'event'` Discriminants

**Location**:
- `src/services/DebugService.test.ts` (13 occurrences)
- `src/ui/debug-viz/useDebugMiniView.test.ts` (2 occurrences)
- `src/ui/debug-viz/DebugMiniView.tsx` (1 occurrence)
- `src/ui/reactFlowEditor/PortInfoPopover.tsx` (2 occurrences)
- `src/ui/components/SimpleDebugPanel.tsx` (2 occurrences)
- `src/compiler/backend/schedule-program.ts` (5 occurrences)
- `src/runtime/StateMigration.ts` (1 occurrence)

**Issue**: These files dispatch on `.kind === 'signal'` or `.kind === 'field'` or `.kind === 'event'`. According to spec (TYPE-SYSTEM-INVARIANTS.md #2), kind should be **derived** from extent, not stored.

**Current State**:
1. **Tests and UI debug code** check `debugValue.kind === 'signal'` where `debugValue` is a runtime debug result object (NOT an IR expression)
2. **schedule-program.ts** filters state mappings using `.kind === 'field'` on `FieldSlotDecl` discriminants
3. **StateMigration.ts** checks `.kind === 'field'` on state mapping objects

**Why This Is Different**: These are NOT checking ValueExpr.kind. They're checking:
- Debug value wrappers (runtime debugging structs)
- Schedule mapping discriminants (backend artifact types)
- State migration metadata

**Analysis**:
- ✅ **No ValueExpr.kind === 'signal/field/event' exists** (that would violate spec)
- ⚠️ **Debug value types** use `kind: 'signal' | 'field'` as discriminants in their own type hierarchy
- ⚠️ **Schedule mappings** use `kind: 'field'` to discriminate FieldSlotDecl from other mappings

**Question for User**: Should debug value types and schedule mapping discriminants use different terminology to avoid confusion with the banned pattern? For example:
- `debugValue.valueKind === 'signal'` instead of `debugValue.kind === 'signal'`
- Or rename to `debugValue.category === 'signal'`
- Or use `debugValue.extent` and derive it

**Recommendation**: This is technically compliant (these aren't ValueExpr types), but could cause confusion. Consider either:
1. Accept as-is (different domain, different types)
2. Rename discriminants for clarity (`valueKind` or `category`)
3. Standardize debug value types to carry CanonicalType and derive kind

**Effort**: Low (if rename), Medium (if restructure to carry CanonicalType)
**Risk**: Low (localized changes to debug infrastructure)

---

## R2: Comment References to "SignalType" in CompilationInspectorService

**Location**: `src/services/CompilationInspectorService.ts:258-259`

**Issue**: Comment says:
```typescript
/**
 * Get resolved port types from the latest TypedPatch.
 * Returns a Map where keys are "blockIndex:portName:in" or "blockIndex:portName:out"
 * and values are resolved SignalTypes.  // ← Comment mentions "SignalTypes"
 *
 * @returns Port types map or undefined if not available
 */
getResolvedPortTypes(): Map<string, unknown> | undefined {
```

**Current State**:
- The comment says "SignalTypes" but the actual return type is `Map<string, unknown>`
- The values are actually `CanonicalType` (or `InferenceCanonicalType`)
- No actual type called "SignalType" exists in the codebase

**Why It Matters**: Misleading documentation. The comment is a legacy artifact from when the type was called SignalType.

**Fix**: Update comment to say "resolved CanonicalTypes" or "resolved types"

**Effort**: 1 minute
**Risk**: None (documentation only)

---

## R3: "Expression" Usage in Comments and Documentation

**Location**: 38 files contain "Expression" in various contexts

**Issue**: Per spec 09-NamingConvention.md, we should use "Expr" consistently, not mix "Expr" and "Expression". The search found:
- Comments referring to "Expression DSL"
- Documentation files (GRAMMAR.md, README.md, FUNCTIONS.md)
- AST type comments
- UI component comments

**Examples**:
- `src/expr/GRAMMAR.md`: "Expression DSL Abstract Syntax Tree"
- `src/expr/README.md`: "Expression Parser Implementation"
- `src/expr/ast.ts`: "Expression AST node"
- Various comments: "expression string", "expression evaluation"

**Current State**:
- **Type names** use "Expr" consistently (ExprNode, ValueExpr, etc.) ✅
- **Documentation** mixes "Expression" (full word) with "Expr" (abbreviation)
- **Comments** vary between "expression" (lowercase, natural English) and "Expr" (type reference)

**Analysis**:
The spec's rule about "no Expression and Expr both existing" primarily targets **type names**, not natural language. Using "expression" as a natural English word in docs/comments is acceptable.

**Question for User**: Should we:
1. Accept "expression" as natural English in docs/comments (current state is fine)
2. Standardize all documentation to say "Expr" everywhere
3. Update only type-adjacent comments to use "Expr", keep natural language "expression" in prose

**Recommendation**: Accept current state. Natural language "expression" in prose is fine; type names use "Expr" consistently.

**Effort**: Low to Medium (depends on scope)
**Risk**: None (documentation/comment changes only)

---

## Context File
See: topic-naming-legacy-context.md for full search results and evidence.
