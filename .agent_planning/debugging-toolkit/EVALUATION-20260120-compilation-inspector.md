# Compilation Pipeline Inspector - Evaluation

**Topic:** Compilation Pipeline Inspector
**Location:** `.agent_planning/debugging-toolkit/2-compilation-pipeline-inspector.md`
**Evaluation Date:** 2026-01-20
**Verdict:** CONTINUE

---

## Executive Summary

The Compilation Pipeline Inspector is a debug UI feature to visualize data flow through all 7 compiler passes (Pass 2-7 + normalization final output). The project has **strong foundational infrastructure** in place.

**User Decisions:**
- History model: Keep last 2 compilations for comparison
- Normalization: Show only final normalized patch (not sub-passes)
- Display depth: Full detail must be captured, UI expands as needed

---

## 1. Current State

### 1.1 Compilation Pipeline (7 Passes)

The compiler has 7 passes to inspect:

| Pass | Name | Input → Output |
|------|------|----------------|
| 1 | Normalization | `Patch` → `NormalizedPatch` |
| 2 | Type Graph | `NormalizedPatch` → `TypedPatch` |
| 3 | Time Topology | `TypedPatch` → `TimeResolvedPatch` |
| 4 | Dependency Graph | `TimeResolvedPatch` → `DepGraphWithTimeModel` |
| 5 | Cycle Validation | `DepGraphWithTimeModel` → `AcyclicOrLegalGraph` |
| 6 | Block Lowering | `AcyclicOrLegalGraph` → `UnlinkedIRFragments` |
| 7 | Schedule | `UnlinkedIRFragments` → `ScheduleIR` |

Entry point: `src/compiler/compile.ts`

### 1.2 Existing Debug Infrastructure

**DebugService** (`src/services/DebugService.ts`):
- Stores edge-to-slot mapping (runtime values)
- Singleton pattern already established
- Does NOT capture compilation IR

**EventHub** (`src/events/EventHub.ts`):
- Emits `CompileBegin` and `CompileEnd` events
- Can be extended with per-pass events

**UI Patterns** (from `BlockInspector.tsx`, `InspectorContainer.tsx`):
- MobX + observer pattern for reactive updates
- `InspectorContainer` provides consistent panel styling
- Existing panels use tabs, expandable sections

### 1.3 What Exists ✅

1. All 7 compilation passes fully implemented
2. EventHub with compile events
3. DebugService singleton pattern
4. UI container components
5. MobX stores pattern
6. Dockview panel system

### 1.4 What's Missing ❌

1. Per-pass capture infrastructure
2. CompilationInspectorService
3. UI components (tree view, node detail, search)
4. IR serialization for display
5. History/comparison storage

---

## 2. Architecture for Implementation

### 2.1 Data Flow

```
compile.ts (each pass)
    ↓ capturePass(name, input, output, timing)
CompilationInspectorService
    ↓ stores PassSnapshot[]
    ↓ observable via MobX
CompilationInspectorPanel (React)
    ↓ renders tree view
    ↓ provides search
    ↓ shows node details
```

### 2.2 PassSnapshot Structure

```typescript
interface PassSnapshot {
  passNumber: number;      // 1-7
  passName: string;        // "normalization", "type-graph", etc.
  timestamp: number;       // When captured
  durationMs: number;      // How long pass took
  input: unknown;          // Previous pass output (JSON-serializable)
  output: unknown;         // This pass output (JSON-serializable)
  errors: CompileError[];  // Errors from this pass
  inputSize: number;       // Character count of serialized input
  outputSize: number;      // Character count of serialized output
}

interface CompilationSnapshot {
  compileId: string;
  timestamp: number;
  totalDurationMs: number;
  passes: PassSnapshot[];
  status: 'success' | 'failure';
}
```

### 2.3 Files to Create

```
src/services/CompilationInspectorService.ts   (~300 lines)
src/ui/components/CompilationInspector.tsx    (~400 lines)
src/ui/components/IRTreeView.tsx              (~300 lines)
src/ui/components/IRNodeDetail.tsx            (~200 lines)
src/ui/components/CompilationInspector.css    (~150 lines)
```

### 2.4 Files to Modify

```
src/compiler/compile.ts                       (+30 lines)
src/ui/components/app/App.tsx                 (+20 lines - panel registration)
```

---

## 3. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Large IR structures | Medium | Lazy rendering, virtualization |
| Circular references in IR | Medium | Custom JSON replacer with visited tracking |
| Functions in IR (PureFn) | Low | Serialize type/name only, not body |
| Memory with history | Low | Limit to 2 compilations as per user decision |

---

## 4. Scope Decisions

**In Scope:**
- Service to capture all 7 passes
- History of 2 compilations for comparison
- Tree view with expand/collapse
- Search by block ID, slot ID, instance ID
- Raw JSON toggle
- Pass selector (tabs or dropdown)

**Out of Scope (for MVP):**
- Side-by-side diff view
- Export to file
- Keyboard shortcuts (Ctrl+Shift+C)
- Pagination (not needed with virtualization)

---

## 5. Confidence Assessment

**Confidence: HIGH**

Reasons:
- Clear architecture with existing patterns to follow
- All integration points identified
- User decisions eliminate ambiguities
- Similar to existing BlockInspector component
- No research needed

---

## 6. Recommended Approach

1. **CompilationInspectorService first** - Capture infrastructure
2. **Compiler integration** - Add capture calls to compile.ts
3. **Basic UI** - Panel with pass selector and tree view
4. **Search and polish** - Add search, node details, history comparison
