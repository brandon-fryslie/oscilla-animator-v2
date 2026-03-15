# Oscilla Animator v2 Documentation

This directory contains technical documentation for maintainers and contributors working on the Oscilla Animator v2 codebase.

## Purpose

These documents provide deep technical explanations of core architectural patterns, design decisions, and implementation details. They complement the canonical specification in `design-docs/CANONICAL-oscilla-v2.5-20260109/` by:

- Explaining **why** specific patterns were chosen (design rationale)
- Documenting **how** invariants are enforced mechanically (implementation details)
- Providing **examples** of correct and incorrect usage patterns
- Offering **guidance** for maintainers making changes or additions

## Target Audience

This documentation assumes:
- Familiarity with the Oscilla domain (blocks, graphs, signals, fields)
- Understanding of the type system (domains, payloads, cardinality)
- Experience reading and modifying runtime or compiler code
- Working knowledge of TypeScript and modern JavaScript

**New contributors** should start with:
1. `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` (conceptual foundation)
2. `CLAUDE.md` (architecture overview and navigation)
3. Then dive into specific topics here as needed

## Organization

Documentation is organized by subsystem:

### `runtime/`
Deep technical documentation of the runtime execution model:
- `execution-model.md` - Frame execution lifecycle and two-phase pattern
- `coordinate-system-canonical-spec.md` - Canonical world/clip/screen contract and camera orientation constants

### Patch DSL
- `patch-dsl-hcl2-support.md` - Supported HCL2 subset, unsupported features, and string interpolation policy

### `WebGPU-Complete/` (canonical WebGPU design source)
Canonical WebGPU architecture and migration design lives in:
- `./WebGPU-Complete/`

Outside `docs/WebGPU-Complete/`, WebGPU documents are historical pointers only and must not define competing architecture or readiness criteria.

### `WebGPU-Future/` (post-stabilization architecture direction)
Longer-horizon renderer architecture notes live in:
- `./WebGPU-Future/`

`WebGPU-Future/` is intentionally not a competing delivery spec. It documents where we may want to take the renderer architecture after the current `current code -> WebGPU-Complete` migration is finished and stable.

### Guardrail Test Gate

Canonical architecture guardrails live in:
- `src/__tests__/architecture-guardrails.test.ts`
- `src/__tests__/forbidden-patterns.test.ts` (v3 hard rules)
- `src/compiler/__tests__/no-legacy-types.test.ts` (compiler/runtime legacy-type gate)
- `src/services/__tests__/AnimationLoop.test.ts` (canonical frame-order/runtime hot-path invariants)

Canonical v3 architecture source:
- `design-docs/OSCILLA-WEBGPU-V3-REFERENCE-ARCHITECTURE.md`
- `docs/WebGPU-Complete/P0-3__Refactoring_to_Handle-Based_Architecture.md`

### WebGPU Matrix Harness

WebGPU browser conformance/perf harness:
- `scripts/webgpu-browser-matrix.mjs`

Common runs:
- Chromium gating only (default): `pnpm run test:webgpu-matrix`
- Chromium + Playwright WebKit telemetry:
  - `WEBGPU_MATRIX_INCLUDE_WEBKIT=1 pnpm run test:webgpu-matrix`
- Chromium + real Safari telemetry (macOS):
  - `WEBGPU_MATRIX_INCLUDE_SAFARI=1 pnpm run test:webgpu-matrix`
- Full matrix (Chromium + WebKit + Safari):
  - `WEBGPU_MATRIX_INCLUDE_WEBKIT=1 WEBGPU_MATRIX_INCLUDE_SAFARI=1 pnpm run test:webgpu-matrix`

Report output:
- `artifacts/webgpu-browser-matrix.json`

### Naming Conventions

- Use **kebab-case** for filenames (e.g., `execution-model.md`, not `ExecutionModel.md`)
- Avoid numbered prefixes (e.g., `01-execution.md`) - use descriptive names instead
- One document per major concept/pattern
- Keep documents focused (5-10k tokens each)

## Relationship to Other Documentation

| Location | Purpose | Audience |
|----------|---------|----------|
| `design-docs/CANONICAL-oscilla-v2.5-20260109/` | Canonical specification | All contributors |
| `docs/` (this directory) | Technical deep dives | Maintainers |
| `CLAUDE.md` | Architecture overview | All contributors |
| `.claude/rules/` | Hard constraints and patterns | Claude Code agent |
| Code comments | Implementation details | Developers |

## Contributing

When adding new documentation:
1. Ensure it doesn't duplicate existing spec content (link to spec instead)
2. Focus on **why** and **how**, not just **what** (code already shows what)
3. Include concrete examples (correct and incorrect patterns)
4. Link to relevant implementation files
5. Keep documents evergreen (prefer function names over line numbers)

## Static Site Generation

Currently, these are raw Markdown files. A static site generator (Hugo, Docusaurus, etc.) may be added in the future to improve navigation and cross-referencing.
