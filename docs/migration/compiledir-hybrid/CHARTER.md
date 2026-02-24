# Migration Charter: compiledir-hybrid-foundation

## Canonical Target
Old hybrid CompiledIR seams must be impossible in production code.
New canonical compiler/runtime model must be the sole path for addressing, evaluation, binding, and public builder APIs.

Source of truth:
- `/Users/bmf/.codex/worktrees/804c/oscilla-animator-v2/docs/WEBGPU-DESIGN-PREREQUISITES-2026-02-22.md`

Supporting audit input:
- `/Users/bmf/.codex/worktrees/49f4/oscilla-animator-v2/docs/COMPILED-IR-HYBRID-MIGRATION-AUDIT-2026-02-22.md`

Scope in this tranche only:
- W11, W5, W6, W2, W7, W12

## Invariants and Authorities
| Invariant | Canonical Authority Module | Workstream |
|---|---|---|
| Public builder API exposes only canonical builder contracts | `src/compiler/ir/index.ts`, `src/compiler/index.ts` | W11 |
| Block binding is effects-as-data only (no fallback allocation/lookup) | `src/compiler/backend/binding-pass.ts` | W5 |
| Exactly one scalar/event evaluator family in production path | `src/runtime/ValueExprScalarEvaluator.ts`, `src/runtime/ValueExprEventEvaluator.ts` | W6 |
| Runtime operational addressing does not depend on `program.slotMeta` | `src/runtime/ExprAddressTable.ts` + executor modules | W2 |
| Runtime ABI vocabulary reflects canonical numeric semantics (not `f64`-named hot-path assertions) | `src/runtime/ExprAddressTable.ts` | W7 |
| Runtime/service consumers do not bypass canonical addressing via direct `program.arenaLayout[...]` | runtime/service modules | W12 |

## Kill List (must reach zero)
| ID | Legacy Artifact | Detection Pattern | Scope | Current Count | Target |
|---|---|---|---|---:|---:|
| K-W11-1 | Deprecated IRBuilder public export (IR index) | `export type { IRBuilder } from './IRBuilder'` | `src/compiler/ir/index.ts` | 1 | 0 |
| K-W11-2 | Deprecated IRBuilder public export (compiler index) | `export type { IRBuilder, Step, TimeModel, ValueExpr } from './ir'` | `src/compiler/index.ts` | 1 | 0 |
| K-W11-3 | Production imports of deprecated IRBuilder interface | `from '../compiler/ir/IRBuilder'` | `src/**` (non-test) | 2 | 0 |
| K-W5-1 | Optional effects migration mode | `Optional during migration` | `src/blocks/registry.ts` | 1 | 0 |
| K-W5-2 | Binder fallback allocation path | `Pure block fallback - allocate slot now` | `src/compiler/backend/binding-pass.ts` | 1 | 0 |
| K-W5-3 | Binder fallback state-slot discovery calls | `= builder.findStateSlot(` | `src/compiler/backend/binding-pass.ts` | 3 | 0 |
| K-W6-1 | Scalar evaluator shadow-mode marker | `runs in parallel with legacy scalar evaluators during migration` | `src/runtime/ValueExprScalarEvaluator.ts` | 1 | 0 |
| K-W6-2 | Event evaluator shadow-mode marker | `runs in parallel with legacy EventEvaluator during migration` | `src/runtime/ValueExprEventEvaluator.ts` | 1 | 0 |
| K-W6-3 | Legacy predicate buffer surface | `eventPrevPredicate` | `src/runtime/RuntimeState.ts` | 8 | 0 |
| K-W2-1 | Runtime operational reads of `program.slotMeta` | `program.slotMeta` | `src/runtime/ExprAddressTable.ts`, `src/runtime/ScheduleExecutor.ts`, `src/runtime/executeFrameStepped.ts` | 3 | 0 |
| K-W2-2 | Fake render output slot hack marker | `jammed into slotMeta with a fake type` | `src/compiler/compile.ts` | 1 | 0 |
| K-W7-1 | f64-named hot-path assertion API | `assertF64Stride` | `src/runtime/ExprAddressTable.ts`, `src/runtime/ScheduleExecutor.ts`, `src/runtime/executeFrameStepped.ts` | 5 | 0 |
| K-W12-1 | Direct runtime/service arenaLayout indexing bypass | `= program.arenaLayout[` | `src/runtime/**`, `src/services/**` (non-test) | 2 | 0 |

## Temporary Allowlist (must reach zero)
| ID | Allowed Adapter/Fallback | Allowed Location(s) | Owner | Current Count | Removal Condition |
|---|---|---|---|---:|---|
| A-W11-1 | Temporary direct imports of deprecated `IRBuilder` interface pending packetized migration | `src/expr/index.ts`, `src/transforms/index.ts` | compiler maintainers | 2 | Remove by end of W11 packets |
| A-W2-1 | Temporary runtime `program.slotMeta` operational reads pending address-table redesign | `src/runtime/ExprAddressTable.ts`, `src/runtime/executeFrameStepped.ts` | runtime maintainers | 3 | Remove by end of W2 packets |

## Completion Definition
- All kill-list counts are zero.
- All allowlist counts are zero.
- Duplicate authority findings are zero.
- Core fallback findings are zero.
- Lane B inventory is zero.

// [LAW:verifiable-goals] Completion is numeric and machine-checkable.
// [LAW:single-enforcer] Each invariant must end with one authority boundary.
