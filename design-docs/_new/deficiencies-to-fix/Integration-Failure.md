❯ What other deficiencies beyond these things did you encounter?

⏺ Looking beyond the core type system and block architecture issues, I encountered several other deficiencies:

1. State Persistence vs Development Iteration

Issue: localStorage caching prevents HMR from working properly
- File changes ignored because browser loads cached patch
- Developers must manually clear localStorage to see updates
- This suggests the app wasn't designed with rapid iteration in mind

Root cause: State persistence mechanism (localStorage) doesn't coordinate with development workflow (HMR). The system
solves "persist user work" but breaks "dev iteration speed."

  ---
2. Compiler Diagnostics Architecture is Shallow

Beyond just error messages, the whole diagnostic system seems under-specified:
- Error: "Undefined input z" - missing context about what z should be
- Error: "Undefined input in0" - doesn't tell you the source or why it's undefined
- Build errors in DiagnosticHub suggest inconsistent type definitions

Pattern: Errors are generated late (at point of failure) rather than early (at validation). The system catches problems
but doesn't collect enough context to explain them.

  ---
3. Block Lifecycle and Instance Tracking Unclear

The Expression block wiring mystery suggests deeper issues:
- Same wiring pattern works in one context, fails in another
- Could indicate:
    - Instance IDs not tracking correctly across block additions
    - Block initialization order is implicit, should be explicit
    - State leakage between instances

Related: The "camera variable is declared but never read" warning suggests:
- Block taxonomy isn't clear (source vs sink vs effect blocks)
- Type system doesn't capture "this block has side effects only"
- Compiler doesn't distinguish read-only outputs from state-only blocks

  ---
4. Patch Construction Validation is Minimal

Issue: Demo patches only fail at compile time, not construction time
- path-field-demo.ts builds successfully with invalid wiring
- Only fails when npm run build or demo runs
- No runtime validation of patch during construction

Implication: The PatchBuilder API should validate as you wire, not later.

  ---
5. IR Materialization Strategy is Implicit

Issue: How fields actually become runtime values isn't clear
- PathField outputs are FieldExpr in IR
- Gets materialized by Materializer at runtime
- But:
    - What owns the materialization?
    - How does it know which fields need special handling?
    - How does it find path topology when PathField.arcLength needs it?

Pattern: Critical runtime behavior (how fields become buffers) is distributed and implicit rather than explicit.

  ---
6. Adapter System is Partially Integrated

Found: canonical-address.test.ts has failing tests with missing exports
- AdapterAddress type isn't exported
- isAdapterAddress() function isn't exported
- 5 tests failing

Implication: Adapter system was started but incompletely wired. Part of the foundation that's supposed to exist
(auto-insert adapters on type mismatches) is broken.

  ---
7. Expression DSL Incomplete

From recap: Expression DSL doesn't support Vec2/Vec3 component access (.x, .y, .z)
- Works at field level (kernels can swizzle)
- Doesn't work at expression level
- This is documented as "deferred" but blocks certain patterns

Pattern: Features marked "deferred" accumulate without resolution path.

  ---
8. Field Kernel System has Hidden Constraints

Issue: Kernels can't access what they need for common operations
- Can't compute tangents (need neighbor access)
- Can't compute arc length (need cumulative state)
- Can't understand path structure (topology is opaque)

But this isn't documented clearly in:
- Block definitions (no "requires topology" annotation)
- Kernel interface contracts (no "this kernel can access X" specification)
- Block library organization (unclear why some features are deferred)

  ---
9. Test Coverage Gaps in Core Systems

Evidence:
- canonical-address tests failing suggest address system has bugs
- No comprehensive tests for:
    - Block wiring edge cases
    - Instance tracking across patches
    - Field kernel materialization
    - Type compatibility rules

  ---
10. Documentation Drift Between Spec and Implementation

Observed:
- CLAUDE.md says "Invariant enforcement: Critical properties are mechanically enforced"
- But cardinality mismatches aren't caught until compile time
- Spec says adapters should auto-insert, but they don't
- PathField "deferred features" aren't tied to any plan

Pattern: Spec promises mechanical enforcement, but enforcement is partial/manual.

  ---
11. Performance Considerations Invisible to User

Issue: No visibility into:
- Why certain blocks don't compose
- Whether field materialization is efficient
- What the cost of kernel operations is
- How state continuity checking works

This made it impossible to debug why the demo was slow or whether workarounds were performance-wise acceptable.

  ---
12. Tool Integration Gaps

localStorage issue points to a bigger problem: integration between:
- File system (code changes)
- Browser state (localStorage)
- HMR system (hot reload)
- Demo patch loader

None of these coordinate well. They're designed independently.

  ---
Summary: Beyond Type System

Type system issues are surface symptoms of deeper architectural problems:
┌──────────────────────────────┬─────────────────────────────────────────────────────────────┐
│           Symptom            │                         Root Cause                          │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ Bad error messages           │ Diagnostics are shallow, lack context                       │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ Expression wiring mystery    │ Instance tracking is implicit, initialization order matters │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ localStorage breaks HMR      │ Tools don't coordinate                                      │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ Incomplete adapters          │ Features started but not completed                          │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ Deferred features accumulate │ No resolution path for incomplete work                      │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ Patch validation minimal     │ Early validation not designed in                            │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ Kernel constraints hidden    │ No explicit contract language                               │
├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ Test failures in core        │ Coverage gaps in fundamental systems                        │
└──────────────────────────────┴─────────────────────────────────────────────────────────────┘
The real issue: The system was designed in layers that don't communicate:
- Type system doesn't tell you semantics
- Blocks don't document requirements
- IR materialization is implicit
- Diagnostics don't have context
- Tools don't coordinate

Each layer works in isolation; the failures only emerge when you try to compose them.

