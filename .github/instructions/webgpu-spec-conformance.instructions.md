---
applyTo: "src/compiler/**/*.ts,src/render/webgpu/**/*.ts,src/runtime/**/*.ts,src/services/**/*.ts,docs/WebGPU-Complete/**/*.md,docs/compiler/**/*.md"
---

# WebGPU / Compiler Spec-Conformance Instructions

Review with strict spec conformance.

- Validate changes against `docs/WebGPU-Complete/AGENTS.md` and the relevant phase/spec doc.
- Enforce WebGPU-only runtime assumptions; do not accept fallback renderer paths.
- Ensure invariants have one enforcing boundary only.
- Ensure each concept has one canonical representation; reject dual state surfaces.
- Reject control-flow gating where dataflow contracts are required.
- Require deterministic behavior across recompiles/runtime hot-swaps.
- Flag any new mode/flag without ownership, rollout, and deletion plan.
- Require tests that verify behavior contracts, not implementation structure.
