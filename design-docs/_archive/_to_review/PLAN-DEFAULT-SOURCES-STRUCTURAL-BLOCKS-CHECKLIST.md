# Default Sources as Structural Blocks — Checklist

**Status**: Updated to align with §15 (Block & Edge Roles) and §16 (Graph Normalization)

Use this as the "do in order" sheet for `plans/PLAN-DEFAULT-SOURCES-STRUCTURAL-BLOCKS.md`.

---

## A) Types and Infrastructure

### Role Types (per §15)
- [ ] Add `BlockRole` discriminated union to `src/editor/types.ts`
  - `{ kind: 'user' }` | `{ kind: 'structural'; meta: StructuralMeta }`
- [ ] Add `StructuralMeta` type with variants: `defaultSource`, `wireState`, `globalBus`, `lens`
- [ ] Add `EdgeRole` discriminated union: `user`, `default`, `busTap`, `auto`
- [ ] JSDoc comments explaining each variant

### Graph Types (per §16)
- [ ] Add `RawGraph` interface (user blocks, user edges, attachments)
- [ ] Add `NormalizedGraph` interface (all blocks + edges, no attachments)
- [ ] Add `Attachment` union type with `DefaultSourceAttachment` variant
- [ ] Add `Anchor` type for structural ID derivation

---

## B) Normalization Module

### File Structure
- [ ] Create `src/editor/graph/` directory
- [ ] Create `src/editor/graph/GraphNormalizer.ts`
- [ ] Create `src/editor/graph/StructuralMapping.ts`
- [ ] Create `src/editor/graph/StructuralManager.ts`

### Implementation
- [ ] Implement `normalize(raw, previous?): NormalizedGraph + Mapping`
- [ ] Implement `normalizeDefaultSources()` pass
- [ ] Implement anchor-based ID derivation (`deriveStructuralId()`)
- [ ] Implement `StructuralMapping` class with bidirectional lookup

---

## C) Const Provider Blocks

### Block Definitions
- [ ] Create `src/editor/blocks/structural/const-providers.ts`
- [ ] Add `DSConstSignalFloat` block definition
- [ ] Add `DSConstSignalInt` block definition
- [ ] Add `DSConstSignalColor` block definition
- [ ] Add `DSConstSignalVec2` block definition
- [ ] Add `DSConstFieldFloat` block definition
- [ ] Add `DSConstFieldVec2` block definition
- [ ] Add `DSConstFieldColor` block definition

### Block Compilers
- [ ] Create `src/editor/compiler/blocks/structural/` directory
- [ ] Add compilers for each DSConst* block (pass-through: out = lift(value))
- [ ] Register in `src/editor/compiler/blocks/index.ts`

### UI Filtering
- [ ] Tag all DSConst* blocks with `['structural', 'defaultSource']`
- [ ] Update `BlockLibrary.tsx` to filter `tags.includes('structural')`

---

## D) Store Integration

### RawGraph Store
- [ ] Add `attachments: Attachment[]` to patch state
- [ ] Add helpers: `getAttachment(blockId, portName)`, `setAttachment(...)`
- [ ] Deterministic attachment IDs: `attach:ds:${blockId}:${portName}`

### Normalization Integration
- [ ] Call `normalize()` before compile
- [ ] Pass `NormalizedGraph` (not `RawGraph`) to compiler
- [ ] Cache normalized graph for performance

### Persistence
- [ ] Save `attachments` array (not structural blocks)
- [ ] Load: rebuild structural blocks via normalization
- [ ] Backward compat: if no attachments, create default Const attachments

---

## E) Validation (per §15 Invariant 5)

### Implementation
- [ ] Create `src/editor/semantic/validateRoleInvariants.ts`
- [ ] Implement checks:
  - [ ] Default edges reference structural defaultSource blocks
  - [ ] Every input has at least one source (multiple allowed)
  - [ ] All structural blocks have valid anchors
  - [ ] No cycles unless mediated by memory blocks

### Integration
- [ ] Call `validateRoleInvariants()` after normalization
- [ ] Surface diagnostics in editor (not fatal errors)

---

## F) UI Updates

### Inspector
- [ ] Update `DefaultSourcesSection` for attachment editing
- [ ] Provider dropdown: Const + allowlisted alternatives
- [ ] Value control: edit attachment config

### PatchBay
- [ ] Filter structural blocks by default: `role.kind === 'user'`
- [ ] Add debug toggle: "Show structural blocks"
- [ ] When shown, render with distinct visual style

### Port Affordances
- [ ] Show "Default" badge on ports fed by default sources
- [ ] Click badge → show attachment editor

---

## G) Documentation Updates

### Terminology
- [ ] Replace "hidden block" with "structural block" in all docs
- [ ] Replace "compiler injection" with "normalization"
- [ ] Replace "provider block" with "structural defaultSource block"
- [ ] Update ROADMAP.md references

### Files to Update
- [ ] `design-docs/**/*.md`
- [ ] `.agent_planning/**/*.md`
- [ ] `src/**/*.ts` comments
- [ ] JSDoc strings

---

## H) Manual Verification

### Basic Functionality
- [ ] `just dev` runs without errors
- [ ] Add block with numeric input, leave unwired
- [ ] Verify default source UI appears in Inspector
- [ ] Change value, see output change

### Normalization Behavior
- [ ] Inspect NormalizedGraph: structural blocks exist
- [ ] Structural blocks have correct role metadata
- [ ] Structural edges have correct role with blockId reference

### Source Replacement
- [ ] Wire something into input → default source disappears from normalized graph
- [ ] Disconnect wire → default source reappears
- [ ] Undo disconnect → default source disappears again

### UI Filtering
- [ ] Structural blocks NOT in block palette
- [ ] Structural blocks NOT visible in PatchBay (default)
- [ ] Enable debug view → structural blocks visible with distinct style

### ID Stability
- [ ] Rearrange blocks → structural block IDs unchanged
- [ ] Reload patch → same structural block IDs

---

## Acceptance Criteria Summary

| Criterion | Verification |
|-----------|-------------|
| Role types defined | `pnpm typecheck` passes |
| Normalization produces structural blocks | Inspect NormalizedGraph in debugger |
| Roles have correct metadata | Structural blocks have `meta.kind: 'defaultSource'` |
| IDs are anchor-stable | Reload patch, IDs unchanged |
| Validation catches errors | Add invalid role, see diagnostic |
| UI filters structural | Palette has no DSConst* blocks |
| Compiler ignores roles | Same compiled output with/without roles |
| Undo/redo works | Operations track attachments, not blocks |
