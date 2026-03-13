# P5-2: Error Propagation / Developer Experience - TRIVIAL Items

## Item 1: Stale State Rule (Previous Pipeline Survives)
**Spec says**: When the user makes an invalid connection, the compiler rejects the update and the runtime continues running the old pipeline. Music doesn't stop. Visuals don't freeze.
**Implementation**: `CompileOrchestrator.ts` implements this pattern -- compilation failures do not replace the running program. `StateMigration.ts` validates new state before applying. The runtime continues with the last valid program on compile error. This is a core architectural pattern verified across multiple files.
**Gap**: None -- this is a fundamental design principle of the codebase.
**Classification**: TRIVIAL (fully implemented, matches spec)

## Item 2: Connection-Time Type Validation
**Spec says**: Invalid links are rejected at interaction time. Compiler still validates full graph.
**Implementation**: The graph editor validates connections at interaction time (type compatibility checks in the UI layer). The compiler also validates the full graph and emits diagnostics.
**Gap**: None -- both layers of validation exist.
**Classification**: TRIVIAL
