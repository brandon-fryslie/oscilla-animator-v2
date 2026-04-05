# Coding Conventions

**Analysis Date:** 2026-04-05

## Naming Patterns

**Files:**
- PascalCase for all TypeScript files: `BlockLibrary.tsx`, `CompileOrchestrator.ts`, `RootStore.ts`
- Suffixes indicate purpose: `.test.ts` for unit tests, `.spec.ts` for Playwright E2E tests, `.tsx` for React components
- Modules exporting a single primary export use that name: `RootStore.ts` exports `RootStore` class
- Index files aggregate related exports: `src/blocks/shape/index.ts` registers all shape blocks
- Barrel files use path suffix: `src/blocks/all.ts` (not `index.ts`)

**Functions:**
- camelCase throughout: `compileFrontend()`, `findAdapter()`, `extractConstraints()`
- Prefixes indicate intent:
  - `create*`: Factory/constructor functions (`createInstance()`, `createLinePathTopology()`)
  - `register*`: Sideeffect registration (`registerBlock()`, `registerAllBlocks()`)
  - `build*`: Graph construction helpers (`buildPatch()`)
  - `require*`: Validation that throws on failure (`requireConfig()`, `requireInst()`, `requireManyInstance()`)
  - `resolve*`: Computation with optional fallback (`resolveInputConstant()`)
  - `extract*`: Data transformation with diagnostics (`extractConstraints()`)
  - `find*`: Search/query operations (`findAdapter()`, `findTopologyIdForField()`)
  - `is*` / `has*`: Boolean checks (`isCompositeBlockDef()`, `isAxisInst()`)
  - `get*`: Accessor returning value or throwing (`getPortType()`)
- Return-type-driven naming: `analyze*()` returns diagnostics, `lower*()` returns IR nodes, `solve*()` returns solution

**Variables:**
- camelCase: `const portKey = ...`, `let baseCardinalityAxis = ...`
- Descriptive over cryptic: `controlPointsFieldId` not `cpfId`
- Branded IDs use full type name: `const instanceId: InstanceId = ...`, not `const id: InstanceId`
- Collections use plural: `const adapters: AdapterSpec[] = ...`, `const errors: readonly string[]`
- Boolean flags: `isClosed`, `hasInstance`, `wasResolved`, `canBroadcast`

**Types:**
- PascalCase for all type names: `CanonicalType`, `BlockIRBuilder`, `ValueExpr`, `NormalizedPatch`
- Union discriminants are camelCase: `{ kind: 'ok', payload }` not `{ kind: 'OK' }`
- Discriminant name is consistent per union family: `ValueExpr` uses `kind`, not mixing with `op` or `type`
- Branded ID types use `__brand` pattern for safety: `type InstanceId = string & { readonly __brand: 'InstanceId' }`
- Interface prefixes reserve names: `BlockIRBuilder` (not just `IRBuilder` for clarity)
- Result types use discriminated unions: `{ kind: 'ok', payload } | { kind: 'error', errors }`

## Code Style

**Formatting:**
- Prettier is configured (implicit via package.json devDependencies)
- 2-space indentation (Vitest/Vite defaults)
- Max line length not explicitly enforced but long lines are broken

**Linting:**
- ESLint with typescript-eslint, strict type checking enabled
- No `any` types allowed outside designated boundaries (PatchPersistence.ts)
- TypeScript target: ES2022
- Strict mode: true

**Custom ESLint Rules** (enforce architectural laws):
- `no-defaults-in-lower`: Block `lower()` functions cannot have default values — all behavior is data-driven
- `no-default-source-in-lower`: Block `lower()` cannot access default sources — upstream resolved it
- `no-block-type-check-in-lower`: Block `lower()` cannot branch on block type — design different concepts as different declarations [LAW:no-type-checking-oneoffs]
- `no-nullish-coalescing-defaults`: Data-path files cannot use `??` — null = upstream bug
- `no-hot-path-alloc`: Hot-path files cannot allocate on heap — zero-allocation requirement
- `no-nullable-runtime-contracts`: Runtime contract nullability enforced at bootstrap boundary only

**File Headers:**
- All files open with JSDoc describing purpose, not implementation
- Example from `RootStore.ts`:
  ```typescript
  /**
   * RootStore - Store Composition
   *
   * Creates and owns all child stores.
   * Provides dependency injection (e.g., SelectionStore depends on PatchStore).
   * Single instance accessed via React context.
   *
   * Extended with EventHub and DiagnosticHub for event-driven diagnostics.
   */
  ```

## Import Organization

**Order:**
1. Standard library (`import type { ... } from 'vitest'`)
2. External packages (`import React from 'react'`, `import { mobx } from 'mobx'`)
3. Internal project imports (`import { Patch } from '@/graph'`)
4. Type-only imports grouped at top: `import type { BlockDef } from '../../blocks/registry'`
5. Side-effect imports at bottom (block registration): `import '../all'`

**Path Aliases:**
- Use `@/*` for all project imports: `@/graph`, `@/blocks`, `@/core/canonical-types`
- Never use relative paths (`../../`) in new code, though not yet fully migrated
- Barrel files (`index.ts`) in `src/blocks/`, `src/stores/`, `src/compiler/` expose public API

**Side-Effect Imports:**
- Block registration happens via side-effect import: `import '../all'` in test setup
- Vitest setupFiles ensure `registerAllBlocks()` runs once for all tests: `src/__tests__/setup-blocks.ts`
- Modules with side effects are explicit in filenames and comments

## Error Handling

**Patterns:**
- Throw synchronously on invariant violations: `throw new Error('...')`
- Error messages include context: `throw new Error('promoteToMany includes non-var port ${p} (axis: ${ax ? 'inst' : 'missing'})')`
- Validation functions throw, not return errors: `requireConfig()` throws if missing, returns value if present
- Discriminated result unions for recoverable errors: `{ kind: 'ok', payload } | { kind: 'error', errors: string[] }`
  - Example: `type C1CompileResult = { kind: 'ok', payload: PipelineInstallPayload } | { kind: 'error', errors: readonly string[] }`
- No silent fallbacks: if computation fails, propagate or explicitly handle

**Validation Gates:**
- One enforcement boundary per cross-cutting concern [LAW:single-enforcer]
- Axis validation: `src/compiler/frontend/axis-validate.ts` is the ONLY place axis invariants are checked
- Runtime contracts: nullability enforced only at bootstrap seam (`src/services/AnimationLoop.ts`, `src/services/RuntimeService.ts`)

**Error Context:**
- Include block ID, port key, or other localization in error messages
- Example: `'PathField: Could not find topology for control points field. The control points input must come from a shape-producing block'`

## Logging

**Framework:** console (no dedicated logger)

**Patterns:**
- `console.log()` for non-error trace: `src/demo/hcl/__tests__/hcl-demos.test.ts` uses it in tests
- `console.error()` for errors (rare): Most errors throw or return discriminated unions
- Diagnostics system captures user-facing messages: `DiagnosticsStore` handles all user notifications, not console
- No logging in hot paths (zero-allocation requirement)

## Comments

**When to Comment:**
- Block purpose and semantics: Every block registration has a block-level comment explaining inputs/outputs/behavior
- Invariant explanations: Comments explain WHY a constraint exists, not what the code does
- Spec references: Comments cite relevant spec sections: `// Spec Reference: design-docs/CANONICAL-.../topics/XX-...`
- Law citations: Architecture-critical decisions cite the UNIVERSAL-LAWS: `// [LAW:single-enforcer] Enforce explicit "any" at boundary.`
- Algorithm explanation: Complex lowering/type-solving steps explain the approach

**JSDoc/TSDoc:**
- Block definitions have full JSDoc for all inputs/outputs
- Example from `Ellipse` block:
  ```typescript
  /**
   * Ellipse - Geometry generator
   *
   * Produces:
   * - One<shape> handle for instancing/rendering
   * - Field<vec2> control points for deformation pipelines
   *
   * This keeps geometry as first-class data in the graph.
   */
  ```
- Interface methods in builders document parameter/return types, not logic
- Example from `BlockIRBuilder`: Line-by-line JSDoc for each builder method

**Avoid Comments For:**
- Self-explanatory code: `const expanded = patch.blocks.filter(b => b !== block);` doesn't need a comment
- Implementation details (only architectural decisions)
- Transient workarounds (if it's a workaround, fix it, don't document it as permanent)

## Function Design

**Size:**
- Prefer 5-50 lines per function
- Functions > 100 lines are candidates for refactoring/splitting (though some legitimate complex functions exist: `BlockLibrary.tsx` is ~420 lines but complex state management is localized)
- Complex algorithms (lowering, type solving) may exceed 100 lines but are clearly documented

**Parameters:**
- Avoid parameter lists > 5 items: use builder pattern or pass objects
- Example: `lower(ctx: BlockLoweringContext)` instead of `lower(builder, instances, config, graph, diagnostics)`
- Use type narrowing in parameter order: wider types first, narrowed by constraints

**Return Values:**
- Single return type: functions return T or throw
- Nullable returns only at trust boundaries (parsing, external input)
- Return discriminated unions for recoverable errors: `{ kind: 'ok', value } | { kind: 'error', code }`
- Example: `FrontendResult = { kind: 'ok', normalizedPatch, portTypes } | { kind: 'error', diagnostics }`

## Module Design

**Exports:**
- Prefer explicit named exports: `export function compileFrontend(...)` not `export default`
- Barrel files re-export public API: `src/blocks/index.ts` exports all block types
- Type exports with `type` keyword: `export type { CanonicalType } from './canonical-types'`
- Private helpers remain in module (not exported)

**Barrel Files:**
- `src/blocks/all.ts` registers ALL blocks by importing individual modules
- `src/blocks/registry.ts` exports all public functions for querying/registering blocks
- No circular imports: blocks import from core/types, but never reverse

**Isolation:**
- Each block is independent: `src/blocks/shape/ellipse.ts` depends only on registry and core types
- Services are independent: `CompileOrchestrator.ts` is separate from `AnimationLoop.ts`
- Stores depend upward only: `SelectionStore` imports `PatchStore`, never reverse
- UI imports Stores/Services, never reverse

## Architectural Patterns

**Builder Pattern (Pure):**
- `BlockIRBuilder`: Pure expression construction, no side effects
- Example: `const exprId = ctx.b.constant(floatConst(0), canonicalType(FLOAT))`
- Builders return IDs, not mutations; orchestrators apply effects

**Strategy Pattern (Block Registration):**
- `registerBlock()` in `src/blocks/registry.ts` stores all block definitions
- Each block declares capability, inputs, outputs, lowering strategy
- Example: `registerBlock({ type: 'Ellipse', capability: 'pure', loweringPurity: 'pure', lower: (ctx) => ... })`

**Visitor Pattern (IR Walking):**
- `walkIR()` visits ValueExpr trees (observe mode, accumulate results)
- `foldIR()` transforms ValueExpr trees (compose + transform)
- Example: `walkIR(expr, (node) => { accumulator.add(node); })`

**Discriminated Union (Result/Status):**
- All multi-outcome operations return discriminated unions
- Example: `type FrontendResult = { kind: 'ok', ... } | { kind: 'error', ... }`
- Pattern matching via exhaustive `if/switch` on `kind`

## Type-Driven Design

**No Type Checking in Logic** [LAW:no-type-checking-oneoffs]:
- Block behavior NEVER branches on `block.type` or `expr.kind` in general contexts
- Different concepts are different types: `FieldKernel` vs `BroadcastKernel` not `Kernel` with mode flag
- Type system is the only source of truth: `deriveKind(type)` derives signal/field/event from extent axes, never from node type

**Type Aliases for Clarity:**
- `PortKey = string` is a branded type for identifying input/output ports
- `BlockId = string & { readonly __brand: 'BlockId' }` enforces type safety
- Helper functions wrap conversions: `portKey(blockId, 'input', 'name')` not string concatenation

**Payload Type as Single Source of Truth:**
- Every computation on `payload` uses `PayloadType = { kind: '...' }`
- No parallel enum (`PAYLOAD_FLOAT = 0`, `PAYLOAD_INT = 1`), only discriminated unions
- `payloadStride(payload)` returns stride (derived), never stored separately

## MobX Store Conventions

**Reaction Pattern:**
- Stores use `reaction()` for computed dependencies: `reaction(() => store.something, (val) => { ... }, { delay: 100 })`
- Observable class fields are decorated: `@observable` (implicit via MobX 6)
- Actions are explicit: `@action` methods or `action()` wrapper

**Store Structure:**
- Single `RootStore` owns all child stores
- Dependency injection at construction: `new SelectionStore(patchStore)`
- Stores are singletons, accessed via React context

**Observable Data:**
- Patch is immutable: `ImmutablePatch` type, never mutated in place
- Graph edits return new patch: `patchStore.editGraph(fn)` calls reducer function returning new patch
- State changes trigger reactions: `reaction(() => patchStore.patch, () => { recompile(); })`

## React Component Conventions

**Functional Components Only:**
- All components are `React.FC<Props>` (no class components)
- Hooks: `useState`, `useEffect`, `useCallback`, `useMemo` for optimization
- Store integration: `const { patchStore, debugStore } = useStores()` (context hook)

**Props Interface:**
- Props interfaces explicitly inherit from relevant role: `interface BlockLibraryProps extends SomeCommonProps`
- No spreading `...props` unless documented and scoped
- Props are readonly: `readonly` on all fields

**Styling:**
- CSS modules: `import './BlockLibrary.css'` (co-located with component)
- Mantine UI for common components: `@mantine/core` for buttons, modals, etc.
- Emotion-styled components allowed but not primary

---

*Conventions analysis: 2026-04-05*
