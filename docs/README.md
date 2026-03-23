# Oscilla Animator v2 Documentation

## Directory Structure

```
docs/
  current/                          Active, authoritative documentation
    compiler/                       Compiler pipeline, type system, passes
    renderer/                       Rust/WASM renderer and verification
    runtime/                        Execution model, coordinates, hot-path gates
    webgpu-specs/                   Comprehensive WebGPU implementation specs
    agent-workflow/                  Agent loop definitions
    ...                             Other active docs (debug-viz, patch-dsl, etc.)
  legacy/                           Superseded, outdated, or historical docs (pending review)
  README.md                         This file

design-docs/
  CANONICAL-oscilla-v2.5-20260109/  The canonical specification (DO NOT MOVE)
  gemini-plan/                      GPU architecture plan from Gemini planning session
```

## Current Documentation

### GPU Architecture Plan (`design-docs/gemini-plan/`)

| Document | Description |
|----------|-------------|
| `GPU-ARCHITECTURE-PLAN.md` | **The master plan.** Full phased roadmap for the Strangler Fig refactor: Symbolic Memory, Rust MMU, Live Parameters, DispatchKernel, Domains, 2.5D, Physics, MSDF Text. |
| `AGENT_ENGINEERING_STANDARDS.md` | Hard technical invariants for agents: zero-alloc, ABI safety, SoA addressing, Naga AST firewall. |
| `NEW_LAYOUT_SYSTEM.md` | Decoupled Domain Topology Mapping spec: InstanceDomain, ScatterUV, SamplePath. |
| `Dual_Representation_for_Shapes-*.md` | Shape taxonomy deep dive (Types 1-5), 2.5D projection, MSDF text, fluid dynamics. |

### Compiler

| Document | Description |
|----------|-------------|
| `current/compiler/CANONICAL-TYPES.md` | Authoritative type system reference (CanonicalType, PayloadType, UnitType, Extent). |
| `current/compiler/ONE-TRUE-EMITTER.md` | Scoped IR → Naga Arena lowering boundary. |
| `current/compiler/frontend-passes/` | All frontend compiler pass specifications (00 through 20). |
| `current/compiler/cardinality-solver.md` | Cardinality constraint solver design. |
| `current/compiler/final-normalization-fixpoint-spec.md` | Fixpoint normalization loop spec. |
| `current/compiler/Polymorphic-Cardinality-Spec.md` | Polymorphic cardinality design. |
| `current/compiler/unit-audit.md` | Unit typing audit results. |

### Renderer

| Document | Description |
|----------|-------------|
| `current/renderer/RUST-RENDERER.md` | Full Rust/WASM renderer spec: memory, compute, render pipeline, execution loop. |
| `current/renderer/rust-renderer-verification-matrix.md` | 4-gate verification matrix (headless, zero-alloc, visual snapshot, jitter). |
| `current/renderer/RUST-WASM-DEBUG-ABI.md` | Debug probe ABI for edge/port inspection. |

### Runtime

| Document | Description |
|----------|-------------|
| `current/runtime/execution-model.md` | Two-phase frame execution lifecycle. |
| `current/runtime/coordinate-system-canonical-spec.md` | World/clip/screen coordinate contract. |
| `current/runtime/shape-hot-path-no-alloc-gate.md` | Shape handle zero-allocation enforcement gate. |

### WebGPU Specs

| Document | Description |
|----------|-------------|
| `current/webgpu-specs/` | 20+ documents covering GPU-native architecture from memory layout through physics. |
| `current/webgpu-specs/shapes/` | Shape taxonomy implementation blueprints (Types 0-5). |
| `current/webgpu-specs/workstreams/` | Implementation workstream indices and slice definitions (S01-S06). |

### Other

| Document | Description |
|----------|-------------|
| `current/FOUNDATIONAL-SPEC.md` | Core system invariants (non-negotiable). |
| `current/DEBUG-VISUALIZATION.md` | Debug viz system architecture. |
| `current/patch-dsl-hcl2-support.md` | Patch DSL HCL2 syntax support matrix. |
| `current/TEST-REMOVAL-LEDGER-2026-02-25.md` | Tracks functionality from deleted test files. |
| `current/agent-workflow/` | Agent loop definitions for WebGPU implementation. |

## Legacy Documentation

`docs/legacy/` contains documents that have been superseded by the current architecture plan or are historical snapshots. These are preserved for reference but should not be treated as authoritative.

Key categories:
- **WebGPU-Future/**: Pre-Strangler-Fig architecture explorations (superseded by `GPU-ARCHITECTURE-PLAN.md`)
- **WebGPU-Top-Priority/**: Previous priority work items (superseded by phased plan)
- **design-archive/**: Archived canonical types output from earlier spec iterations
- **design-new/**: Mixed design explorations (3D, events, debugger, kernels, etc.)
- **PROMPT-***: Old agent loop prompts
- **V2-ARCH, V3-ARCH-PLAN**: Previous architecture documents

## Relationship to Canonical Spec

| Location | Purpose |
|----------|---------|
| `design-docs/CANONICAL-oscilla-v2.5-20260109/` | The canonical specification (master authority) |
| `docs/current/` | Active technical docs (implementation details, plans, deep dives) |
| `docs/legacy/` | Historical docs (superseded, for reference only) |
| `CLAUDE.md` / `.claude/CLAUDE.md` | Architecture overview and navigation for agents |
| `.claude/rules/` | Hard constraints and patterns for agents |

## Source-Embedded Documentation

Some documentation lives alongside its implementation:

| Location | Description |
|----------|-------------|
| `src/compiler/backend/DEBUGGING.md` | Step-through schedule debugger |
| `src/diagnostics/README.md` | Diagnostics system architecture |
| `src/expr/README.md` | Expression DSL module |
| `src/demo/README.md` | Demo library guide |
| `src/render/wasm/rust/oscilla-rust-renderer/README.md` | Rust renderer crate |
