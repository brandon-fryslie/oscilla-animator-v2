# Type System & Block Architecture Analysis

**Date**: 2026-01-27
**Context**: PathField demo session follow-up
**Scope**: How deficiencies in blocks and type system created complexity

---

## Type System Fragmentation

**The core issue**: The type system has **two parallel worlds** (Field<T> and Signal<T>) that don't interact cleanly:

- **Fields** = per-element values (one value per array element)
- **Signals** = scalar time-varying values (one value per frame)
- **Block wiring**: Requires exact cardinality matching, but errors don't say that

**Manifestation in PathField demo**:
- `pathField.arcLength` is a FIELD (per-vertex value)
- Wired to `SetZ.z` which expects a SIGNAL
- Error: "Undefined input z" (completely unhelpful)
- Should say: "SetZ.z expects Signal<float> but got Field<float>"

This is compounded because:
- Error messages hide the real problem
- No IDE guidance about what each port accepts
- Blocks designed without clear cardinality semantics

---

## Block System Lacks Coherent Design

**Pattern**: Blocks are added incrementally without a unifying architecture:

1. **Expression blocks** work in some contexts but fail mysteriously in others (wiring context issue)
2. **Camera blocks** are "sinks" (don't produce output) but the type system doesn't reflect this
3. **SetZ block** has ambiguous semantics—what types does it accept for `z`?
4. **PathField MVP** is incomplete because kernels can't access what they need

Result: Developers can't predict what will work. Same pattern succeeds in one demo, fails in another.

---

## Kernel System Creates Architectural Dead Ends

**The constraint**: Field kernels operate on typed arrays but can't access:
- Path topology (verb sequence, control point ordering)
- Neighboring elements (for tangent computation)
- Cumulative state (for arc length)

**Cascade of failures**:
1. PathField can't compute `tangent` or `arcLength` → **incomplete block**
2. Can't animate elements *along a path* → **limited animation patterns**
3. Demos hit "use stroked rendering" → **not possible** (stroke rendering unimplemented)
4. Demo tries 3D helix as workaround → **new type system errors**

This created the recursive problem in the demo:
- Try 3D approach (workaround for incomplete features)
- Hit field/signal type issues (block semantic problems)
- Debugging blocked by cryptic error messages (type system UX failure)

---

## Missing Abstractions Create Awkward Workarounds

**Examples of "what should exist but doesn't"**:

| Problem | Current State | Needed |
|---------|---------------|--------|
| Path properties | PathField outputs only position + index | Path-as-value type with queryable properties |
| Sampling functions | Expression block wiring mystery | Clear "sample this function at these points" semantic |
| Per-element state | Limited to intrinsics | Per-element accumulator blocks (FieldLag, FieldPhasor) |
| Stroke rendering | Only fill supported | Stroke styling blocks or attributes |
| Type compatibility | Exact matching required | Automatic adapter insertion for common transforms |

These gaps force users to:
- Use dimension reductions (3D → 2D tricks)
- Wire around limitations (helix workaround instead of proper path rendering)
- Hunt for cryptic errors when workarounds fail

---

## Incomplete Standardization

The codebase has started good abstractions but didn't complete them:

1. **Adapters exist** but are only partially integrated—not auto-inserting on type mismatches
2. **Field intrinsics are clean** (index, normalizedIndex, randomId) but **limited to 3 total**—can't add path-specific intrinsics without kernel changes
3. **IR passes are well-structured** but **validation doesn't prevent type errors early**—errors appear late in compilation
4. **Block registry exists** but **blocks don't declare cardinality requirements clearly**

Result: Developers discover constraints at demo time, not design time.

---

## Specific Complexity Spirals

### PathField Demo Complexity Spiral
```
Goal: 3D helix with path strokes
↓
Can't use strokes (not implemented) → Use filled shapes
↓
Helix needs tangent direction → PathField.tangent not implemented
↓
Workaround: Use arcLength for Z height → Field/signal mismatch
↓
Try to wire arcLength to camera animation → Expression block fails
↓
Debugging blocked by cryptic error messages → Stuck
```

Each missing feature forced a workaround, each workaround exposed the next problem.

### Type System Error Spiral
```
Wire pathField.arcLength to SetZ.z
↓
Type mismatch (field vs signal)
↓
Error: "Undefined input z" (wrong error message)
↓
Assume block naming issue → Rename and try again
↓
Still fails → Check other demos
↓
Working demo uses different block ordering → Try that
↓
Still fails → Need deep debugging of expression-blocks.ts
↓
Investigation reveals: Not a wiring bug, just type mismatch not surfaced
```

Bad error messages created investigation complexity that didn't need to exist.

---

## How This Hurts Development

1. **Trial & Error Required** - Developers can't predict compatibility, must build and debug
2. **Error Messages Hide Solutions** - "Undefined input" doesn't guide toward "use a Signal, not a Field"
3. **Incomplete Features** - PathField tangent/arcLength missing = animation patterns blocked
4. **Inconsistent Block Semantics** - Expression works here, fails there; Camera is a sink but types don't say so
5. **Workarounds Breed Workarounds** - 3D helix demo required 3D transforms → more blocks → more type interactions → more failures

---

## Root Cause Pattern

All of this flows from **early-stage architectural decisions not scaling**:

✅ Good decisions:
- IR passes are clean (well-staged)
- Block registry exists
- Field intrinsics are type-safe

❌ Incomplete decisions:
- Type system distinguishes Field/Signal but doesn't error well
- Blocks declared without full semantic specification
- Kernels constrained too early (before completing PathField MVP)
- Adapters started but not finished

**The fix isn't more blocks**—it's finishing the architectural foundations:
1. **Better type error messages** (surface cardinality mismatches clearly)
2. **Complete block semantic specification** (explicit cardinality requirements)
3. **Finish adapter system** (auto-insert on mismatches)
4. **Kernel architecture enhancement** (or Path-as-value type redesign)

Currently, you're fighting **three layers of incomplete abstractions** at once.

---

## Related Beads Tickets

These follow-on work items were created to address the deficiencies identified:

**Type System & Error Messages** (P2)
- oscilla-animator-v2-0t1n: Fix TypeScript build errors
- oscilla-animator-v2-87k8: Improve error messages for field/signal type mismatches
- oscilla-animator-v2-ouo: Fix path-field-demo compile errors

**Block System Issues** (P2)
- oscilla-animator-v2-13ku: Investigate Expression block wiring context
- oscilla-animator-v2-mizl: Implement stroke rendering

**Kernel Architecture** (P3)
- oscilla-animator-v2-b8qn: Implement PathField tangent and arcLength outputs
- oscilla-animator-v2-mhyi: Fix localStorage caching

**Broader System Issues** (P2-P3)
- oscilla-animator-v2-5s8: Implement multi-component signal returns for swizzle

All grouped under epic: **oscilla-animator-v2-sv0t** - PathField Demo & Type System Follow-on Work

---

## Recommendations for Future Work

### Immediate (P0-P2)
1. Implement clear cardinality checking with specific error messages
    - Feels doable
2. Complete adapter system (auto-insertion on type mismatches)
   - This has changed, again
3. Document block semantic requirements (cardinality, type constraints)
    - Do we even know what these are?  They're evolving rapidly:
      - Payload Type
      - Units
      - Cardinality
      - Generics
      - Varargs

### Medium Term (P2-P3)
1. Enhance kernel system to support path-aware operations
    - This feels too specific.  Let's take a step back and understand what the real solution is
2. Finish PathField feature set (tangent, arcLength)
    - Symptom - not a cause
3. Implement stroke rendering pipeline
    - Yes, but only if it's going to be future-thinking

### Strategic (P3+)
1. Consider Path-as-first-class-value redesign (task 4h6)
2. Per-element state blocks (FieldLag, FieldPhasor, FieldUnitDelay)
    - Instead: finish migration to true cardinality generic kernels and blocks
3. Formalize block semantic specification language
    - I think we're getting close
