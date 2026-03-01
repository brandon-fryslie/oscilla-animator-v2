# Repository Copilot Instructions

Use strict, pedantic standards for both code generation and code review.

## Core expectations

- Treat repository specs and architecture docs as authoritative contracts, not suggestions.
- Prefer explicit failure over silent fallback.
- Flag any change that introduces hidden compatibility shims, duplicate sources of truth, or split invariant enforcement.
- Require concrete evidence for claims (file/line references, failing/passing tests, or reproducible commands).
- If behavior is ambiguous, do not guess; call out the ambiguity and propose a deterministic resolution.

## Review bar

- Review for correctness first, then architecture, then maintainability.
- Surface regressions even if tests pass.
- Be strict about temporal/runtime invariants, ownership boundaries, and data contracts.
- Reject “works locally” justifications without repository-level verification.
- Prefer small, explicit fixes over broad speculative refactors.

## Spec conformance

- For WebGPU/compiler/runtime changes, verify conformance against:
  - `docs/WebGPU-Complete/AGENTS.md`
  - relevant docs in `docs/WebGPU-Complete/`
  - `docs/compiler/ONE-TRUE-EMITTER.md` where applicable
- If implementation and spec conflict, treat implementation as incorrect unless spec update is explicitly part of the change.
