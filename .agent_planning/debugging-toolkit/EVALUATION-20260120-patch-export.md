# Evaluation: Patch Export for LLM Context

**Generated:** 2026-01-20
**Topic:** 4-patch-export-for-llm.md
**Verdict:** CONTINUE

## Executive Summary

The Oscilla v2 codebase is **well-structured for this feature**. All required data is accessible, the architecture is clean with proper separation of concerns, and integration points are clear. No architectural violations or circular dependencies would be introduced.

**Confidence Level:** HIGH - Known approach, clear implementation path.

---

## What Exists (Foundation)

### 1. Patch Data Model ✓

**PatchStore** (`src/stores/PatchStore.ts`): Single source of truth for patch state
- `patch` computed getter returns immutable snapshot: `{ blocks: Map<BlockId, Block>, edges: Edge[] }`
- Blocks contain: `{ id, type, params, label, displayName, domainId, role, inputPorts, outputPorts }`
- Edges contain: `{ id, from: Endpoint, to: Endpoint, enabled, sortKey }`
- **Data is easily enumerable** - Maps and Arrays with clear iteration patterns

### 2. Block Registry & Definitions ✓

**Block Registry** (`src/blocks/registry.ts`): Canonical block library
- `getBlockDefinition(blockType)` returns `BlockDef` with full metadata
- `inputs`: Record<string, InputDef> with `value` (default) and `defaultSource` properties
- **All default values are directly accessible** via `inputDef.value`
- Example: Ellipse block has `rx: 0.02`, `ry: 0.02` defaults defined in InputDef

### 3. Compilation & Status Access ✓

**Compiler** (`src/compiler/compile.ts`): Returns `CompileResult`
- `CompileSuccess`: Contains `program: CompiledProgramIR` with full IR
- `CompileFailure`: Contains error array

**DiagnosticsStore**: MobX observable wrapper
- `store.errors`, `store.warnings` for current error state
- `store.compilationStats` for compilation timing

### 4. Debug Infrastructure ✓

**DebugService** (`src/services/DebugService.ts`): Bridges runtime to UI
- Stores edge-to-slot mapping and slot values
- Provides `getEdgeValue(edgeId)` for runtime probing
- Foundation established in Sprint 1

### 5. UI Patterns ✓

**Toolbar** (`src/ui/components/app/Toolbar.tsx`): Established pattern
- MUI Button components with consistent styling
- Easy integration point for "Export Patch" button

**RootStore** (`src/stores/RootStore.ts`): Central composition hub
- Access to all stores via single instance
- Perfect location to wire PatchExporter

---

## What's Missing (Gaps)

### 1. Core PatchExporter Class ❌

No export functionality exists. Need `src/services/PatchExporter.ts` with:
- `exportToMarkdown(patch, options)` → string
- `exportToJSON(patch)` → serializable object
- Options interface for verbosity, includeDefaults, etc.

### 2. Format Conversion Utilities ❌

Need `src/services/exportFormats.ts` with helpers:
- `formatBlockShorthand(block, definition)` → "b1:Array(count=5000)"
- `formatConnectionShorthand(edge, blocks)` → "b1.out → b2.in"
- `formatConfigTable(blocks)` → markdown table
- `isNonDefault(value, defaultValue)` for omitting defaults

### 3. UI Integration ❌

- No export button in toolbar
- No keyboard shortcut handler (Ctrl+Shift+E)
- No clipboard API usage patterns

### 4. Clipboard Integration ❌

- No `navigator.clipboard.writeText()` usage
- Need async error handling for permissions

---

## Architecture Decisions (Resolved)

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| PatchExporter location | `src/services/PatchExporter.ts` | Services contain business logic; follows DebugService pattern |
| Block defaults access | Import `getBlockDefinition` from registry | `definition.inputs[portId].value` is the authoritative default |
| Compile status | Access via `RootStore.diagnosticsStore` | Read-only query interface, minimal risk |
| UI component pattern | Button in Toolbar.tsx | Established pattern with New/Open/Save |
| Clipboard feedback | Brief toast confirmation | Standard UX pattern |

---

## Dependencies & Risks

### Strengths (Low Risk)

- Data model is clean and enumerable (Map/Array iteration)
- Block definitions immutable and complete
- Compile status accessible via read-only stores
- No circular dependencies introduced
- MUI already in use for UI components

### Potential Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Large patches → large export | LOW | Acceptable for LLM context; could add truncation option |
| Clipboard permissions | LOW | Standard async error handling |
| Default value edge cases | LOW | Clear comparison logic; test with various block types |

---

## Integration Architecture

```
RootStore (central)
├── patch: PatchStore ──→ patch property (blocks + edges)
├── diagnostics: DiagnosticsStore ──→ activeDiagnostics, compilationStats
├── events: EventHub ──→ CompileEnd (for auto-export on compile)
└── (PatchExporter new service)
    ├── Uses: getBlockDefinition from registry
    ├── Uses: DiagnosticsStore for status
    └── Returns: markdown/json strings

UI Integration:
Toolbar.tsx + keyboard shortcut handler
    └── Calls: PatchExporter.exportToMarkdown()
    └── Uses: navigator.clipboard.writeText()
    └── Shows: Toast confirmation
```

---

## Ambiguities (None Blocking)

No blocking ambiguities. Minor design choices can be made during implementation:

1. **Shorthand format details** - Exact notation style (can refine during implementation)
2. **Verbosity levels** - What each level includes (minimal/normal/verbose)
3. **Toast styling** - Use existing MUI Snackbar pattern

---

## Recommendation

**Proceed with HIGH confidence sprint.** All components are well-understood, data access patterns are clear, and no research is required.
