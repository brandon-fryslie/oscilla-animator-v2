# Sprint: unified-inputs - Fold Params into Inputs

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Unify `params` and `inputs` into a single `inputs` Record, eliminating duplication and enabling uiHint on any input regardless of port exposure.

## Architecture Summary

**Before:** `inputs: InputDef[]` + `params: Record<string, unknown>` (separate, duplicated)
**After:** `inputs: Record<string, InputDef>` (unified, params folded in)

Key changes:
- `inputs` becomes a Record (object) instead of array
- `outputs` becomes a Record for symmetry
- `params` field is removed
- `InputDef` gains: `value`, `exposedAsPort`, `hidden`
- `id` moves from inside InputDef to the object key

## Work Items

### Sprint 1: Type Definitions

#### P0: Update InputDef and OutputDef types

**File:** `src/blocks/registry.ts`

```typescript
// BEFORE
export interface InputDef {
  readonly id: string;
  readonly label: string;
  readonly type: CanonicalType;
  readonly optional?: boolean;
  readonly defaultValue?: unknown;
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;
}

// AFTER
export interface InputDef {
  readonly label?: string;           // Defaults to key name
  readonly type?: CanonicalType;        // Required if exposedAsPort
  readonly value?: unknown;          // Default value (was in params)
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;
  readonly exposedAsPort?: boolean;  // Default: true (backward compat)
  readonly optional?: boolean;       // For ports: optional wiring?
  readonly hidden?: boolean;         // Hide from UI (normalizer params)
}

export interface OutputDef {
  readonly label?: string;           // Defaults to key name
  readonly type: CanonicalType;         // Required
  readonly hidden?: boolean;         // For symmetry
}
```

**Acceptance Criteria:**
- [ ] InputDef updated with new fields
- [ ] OutputDef updated for symmetry
- [ ] `id` field removed (now the object key)

#### P1: Update BlockDef interface

**File:** `src/blocks/registry.ts`

```typescript
// BEFORE
export interface BlockDef {
  readonly inputs: readonly InputDef[];
  readonly outputs: readonly OutputDef[];
  readonly params?: Record<string, unknown>;
  // ...
}

// AFTER
export interface BlockDef {
  readonly inputs: Record<string, InputDef>;
  readonly outputs: Record<string, OutputDef>;
  // params REMOVED
  // ...
}
```

**Acceptance Criteria:**
- [ ] `inputs` type changed to `Record<string, InputDef>`
- [ ] `outputs` type changed to `Record<string, OutputDef>`
- [ ] `params` field removed

#### P2: Update registerBlock validation

**File:** `src/blocks/registry.ts` (~line 159)

```typescript
// BEFORE: validates array uniqueness
const inputIds = new Set(def.inputs.map((p) => p.id));
if (inputIds.size !== def.inputs.length) { ... }

// AFTER: object keys are inherently unique
// Check input/output key collision
const inputKeys = Object.keys(def.inputs);
const outputKeys = Object.keys(def.outputs);
for (const key of outputKeys) {
  if (key in def.inputs) {
    throw new Error(`Port ID used as both input and output: ${key}`);
  }
}
```

**Acceptance Criteria:**
- [ ] Validation updated for Record format
- [ ] Input/output key collision still checked

---

### Sprint 2: Block Migrations (14 files)

Each block file needs mechanical conversion:

**Pattern:**
```typescript
// BEFORE
inputs: [
  { id: 'x', label: 'X', type: canonicalType('float'), defaultValue: 1 },
],
params: { x: 1 },

// AFTER
inputs: {
  x: { label: 'X', type: canonicalType('float'), value: 1, exposedAsPort: true },
},
```

#### P0: Migrate core blocks

**Files:**
- `src/blocks/signal-blocks.ts` (Const, Oscillator, etc.)
- `src/blocks/primitive-blocks.ts` (Circle, Square)
- `src/blocks/math-blocks.ts` (Add, Multiply, etc.)

#### P1: Migrate field/array blocks

**Files:**
- `src/blocks/array-blocks.ts`
- `src/blocks/field-blocks.ts`
- `src/blocks/field-operations-blocks.ts`

#### P2: Migrate remaining blocks

**Files:**
- `src/blocks/color-blocks.ts`
- `src/blocks/geometry-blocks.ts`
- `src/blocks/identity-blocks.ts`
- `src/blocks/instance-blocks.ts`
- `src/blocks/render-blocks.ts`
- `src/blocks/time-blocks.ts`
- `src/blocks/test-blocks.ts`

**Acceptance Criteria (all block files):**
- [ ] `inputs` converted from array to Record
- [ ] `outputs` converted from array to Record
- [ ] `params` merged into `inputs` with `exposedAsPort: false` where needed
- [ ] All `id` fields removed (now object keys)

---

### Sprint 3: Consumer Code Updates

#### P0: Update BlockInspector.tsx

**File:** `src/ui/components/BlockInspector.tsx`

Key changes:
- `typeInfo.inputs.map(...)` → `Object.entries(typeInfo.inputs).map(([id, input]) => ...)`
- `typeInfo.inputs.find(i => i.id === x)` → `typeInfo.inputs[x]`
- `typeInfo.inputs.length` → `Object.keys(typeInfo.inputs).length`
- Remove ParamsEditor component (inputs now covers this)
- ParamField logic merges into InputField

**Acceptance Criteria:**
- [ ] All array iterations converted to Object.entries
- [ ] All .find() calls converted to direct key access
- [ ] ParamsEditor removed or merged
- [ ] uiHint works for non-port inputs (like Const.value)

#### P1: Update graph passes

**Files:**
- `src/graph/passes/pass0-polymorphic-types.ts`
- `src/graph/passes/pass1-default-sources.ts`
- `src/graph/passes/pass2-adapters.ts`

Pattern: `blockDef.inputs.find(...)` → `blockDef.inputs[portId]`

**Acceptance Criteria:**
- [ ] All input/output lookups use direct key access
- [ ] Port iteration uses Object.entries/Object.values

#### P2: Update compiler passes

**Files:**
- `src/compiler/passes-v2/pass2-types.ts`
- `src/compiler/passes-v2/pass6-block-lowering.ts`
- `src/compiler/passes-v2/resolveWriters.ts`

**Acceptance Criteria:**
- [ ] `inTypes`/`outTypes` built from Object.values
- [ ] Port lookups use direct key access

#### P3: Update UI components

**Files:**
- `src/ui/reactFlowEditor/nodes.ts`
- `src/ui/reactFlowEditor/OscillaNode.tsx`
- `src/ui/reactFlowEditor/typeValidation.ts`
- `src/ui/components/BlockLibrary.tsx`
- `src/ui/components/ConnectionPicker.tsx`

**Acceptance Criteria:**
- [ ] Node rendering uses Object.entries for ports
- [ ] Port counts use Object.keys().length
- [ ] Type validation uses direct key access

#### P4: Update stores

**Files:**
- `src/stores/PatchStore.ts`
- `src/stores/PortHighlightStore.ts`

**Acceptance Criteria:**
- [ ] Input lookups use direct key access

---

### Sprint 4: Verification

#### P0: Type check and build

```bash
npm run typecheck
npm run build
```

**Acceptance Criteria:**
- [ ] No TypeScript errors
- [ ] Build succeeds

#### P1: Run tests

```bash
npm run test
```

**Acceptance Criteria:**
- [ ] All existing tests pass (or are updated)

#### P2: Manual verification

1. Create Const block → verify slider appears for `value` param
2. Create Circle block → verify slider appears for `radius`
3. Create Add block → verify both inputs show as ports
4. Wire and unwire connections → verify everything works

**Acceptance Criteria:**
- [ ] Const.value shows slider (1-10000)
- [ ] Circle.radius shows slider (0.01-0.5)
- [ ] Wiring still works
- [ ] Inspector renders correctly

## Dependencies

None - self-contained refactor.

## Risks

1. **Large scope** - 14 block files + 12 consumer files. Mitigation: mechanical changes, easily verified.
2. **Runtime behavior** - Lower functions access `config` which comes from params. Need to verify config is still populated correctly from input values.

## Notes

- `lower` functions receive `config` which should now be built from `inputs[key].value`
- The normalizer may need updates to read default values from the right place
- Order of ports in UI should use Object.keys() order (insertion order in modern JS)
