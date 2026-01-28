Looking at the investigation findings, investigation notes, and codebase patterns, here's a broad overview of how block
and type system deficiencies have created complexity:

Type System Fragmentation

The core issue: The type system has two parallel worlds (Field and Signal) that don't interact cleanly:

- Fields = per-element values (one value per array element)
- Signals = scalar time-varying values (one value per frame)
- Block wiring: Requires exact cardinality matching, but errors don't say that

Manifestation in PathField demo:
- pathField.arcLength is a FIELD (per-vertex value)
- Wired to SetZ.z which expects a SIGNAL
- Error: "Undefined input z" (completely unhelpful)
- Should say: "SetZ.z expects Signal but got Field"

This is compounded because:
- Error messages hide the real problem
- No IDE guidance about what each port accepts
- Blocks designed without clear cardinality semantics

  ---
Block System Lacks Coherent Design

Pattern: Blocks are added incrementally without a unifying architecture:

1. Expression blocks work in some contexts but fail mysteriously in others (wiring context issue)
2. Camera blocks are "sinks" (don't produce output) but the type system doesn't reflect this
3. SetZ block has ambiguous semantics—what types does it accept for z?
4. PathField MVP is incomplete because kernels can't access what they need

Result: Developers can't predict what will work. Same pattern succeeds in one demo, fails in another.

  ---
Kernel System Creates Architectural Dead Ends

The constraint: Field kernels operate on typed arrays but can't access:
- Path topology (verb sequence, control point ordering)
- Neighboring elements (for tangent computation)
- Cumulative state (for arc length)

Cascade of failures:
1. PathField can't compute tangent or arcLength → incomplete block
2. Can't animate elements along a path → limited animation patterns
3. Demos hit "use stroked rendering" → not possible (stroke rendering unimplemented)
4. Demo tries 3D helix as workaround → new type system errors

This created the recursive problem in the demo:
- Try 3D approach (workaround for incomplete features)
- Hit field/signal type issues (block semantic problems)
- Debugging blocked by cryptic error messages (type system UX failure)

  ---
Missing Abstractions Create Awkward Workarounds

Examples of "what should exist but doesn't":
Problem: Path properties
Current State: PathField outputs only position + index
Needed: Path-as-value type with queryable properties
────────────────────────────────────────
Problem: Sampling functions
Current State: Expression block wiring mystery
Needed: Clear "sample this function at these points" semantic
────────────────────────────────────────
Problem: Per-element state
Current State: Limited to intrinsics
Needed: Per-element accumulator blocks (FieldLag, FieldPhasor)
────────────────────────────────────────
Problem: Stroke rendering
Current State: Only fill supported
Needed: Stroke styling blocks or attributes
────────────────────────────────────────
Problem: Type compatibility
Current State: Exact matching required
Needed: Automatic adapter insertion for common transforms
These gaps force users to:
- Use dimension reductions (3D → 2D tricks)
- Wire around limitations (helix workaround instead of proper path rendering)
- Hunt for cryptic errors when workarounds fail

  ---
Incomplete Standardization

The codebase has started good abstractions but didn't complete them:

1. Adapters exist but are only partially integrated—not auto-inserting on type mismatches
2. Field intrinsics are clean (index, normalizedIndex, randomId) but limited to 3 total—can't add path-specific
   intrinsics without kernel changes
3. IR passes are well-structured but validation doesn't prevent type errors early—errors appear late in compilation
4. Block registry exists but blocks don't declare cardinality requirements clearly

Result: Developers discover constraints at demo time, not design time.

  ---
Specific Complexity Spirals

PathField Demo Complexity Spiral

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

Each missing feature forced a workaround, each workaround exposed the next problem.

Type System Error Spiral

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

Bad error messages created investigation complexity that didn't need to exist.

  ---
How This Hurts Development

1. Trial & Error Required - Developers can't predict compatibility, must build and debug
2. Error Messages Hide Solutions - "Undefined input" doesn't guide toward "use a Signal, not a Field"
3. Incomplete Features - PathField tangent/arcLength missing = animation patterns blocked
4. Inconsistent Block Semantics - Expression works here, fails there; Camera is a sink but types don't say so
5. Workarounds Breed Workarounds - 3D helix demo required 3D transforms → more blocks → more type interactions → more
   failures

  ---
Root Cause Pattern

All of this flows from early-stage architectural decisions not scaling:

✅ Good decisions:
- IR passes are clean (well-staged)
- Block registry exists
- Field intrinsics are type-safe

❌ Incomplete decisions:
- Type system distinguishes Field/Signal but doesn't error well
- Blocks declared without full semantic specification
- Kernels constrained too early (before completing PathField MVP)
- Adapters started but not finished

The fix isn't more blocks—it's finishing the architectural foundations:
1. Better type error messages (surface cardinality mismatches clearly)
2. Complete block semantic specification (explicit cardinality requirements)
3. Finish adapter system (auto-insert on mismatches)
4. Kernel architecture enhancement (or Path-as-value type redesign)

Currently, you're fighting three layers of incomplete abstractions at once.
