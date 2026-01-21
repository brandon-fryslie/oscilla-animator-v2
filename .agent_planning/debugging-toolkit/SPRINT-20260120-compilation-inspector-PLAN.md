# Sprint: Compilation Pipeline Inspector

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** ✅ COMPLETED

---

## Sprint Goal

Implement a Compilation Pipeline Inspector that visualizes the data flow through all 7 compiler passes, enabling developers to see exactly what IR is generated at each stage and trace where data gets lost or transformed incorrectly.

---

## Scope

**Deliverables:**
1. ✅ CompilationInspectorService - Captures and stores pass outputs
2. ✅ Compiler integration - Capture calls in compile.ts
3. ✅ CompilationInspector UI panel - Displays pass outputs with tree view
4. ✅ Search functionality - Find block/slot/instance IDs across passes

---

## Work Items

### P0: CompilationInspectorService ✅ COMPLETED

**Goal:** Create the service that captures and stores compilation pass outputs.

**Files:**
- `src/services/CompilationInspectorService.ts` (new, ~390 lines)

**Acceptance Criteria:**
- [x] Captures output from each of 7 passes (normalization, pass2-pass7)
- [x] Stores last 2 compilation snapshots for comparison
- [x] Tracks timing per pass (durationMs)
- [x] Handles circular references in IR with custom JSON replacer
- [x] Serializes functions (PureFn) as type/name only
- [x] Observable via MobX for reactive UI updates
- [x] Exports singleton instance like DebugService pattern

**Technical Notes:**
- Follow DebugService singleton pattern
- Use MobX observable for snapshots
- Create `serializeIR()` helper that handles:
  - Circular references (track visited Set)
  - Functions (show `kind` only)
  - Large arrays (keep full data, UI handles display)

**Interface:**
```typescript
interface PassSnapshot {
  passNumber: number;
  passName: string;
  timestamp: number;
  durationMs: number;
  input: unknown;
  output: unknown;
  errors: CompileError[];
  inputSize: number;
  outputSize: number;
}

interface CompilationSnapshot {
  compileId: string;
  timestamp: number;
  totalDurationMs: number;
  passes: PassSnapshot[];
  status: 'success' | 'failure';
}

class CompilationInspectorService {
  // Observable
  readonly snapshots: CompilationSnapshot[];
  readonly currentCompileId: string | null;

  // Capture (called from compile.ts)
  beginCompile(compileId: string): void;
  capturePass(passName: string, input: unknown, output: unknown): void;
  endCompile(status: 'success' | 'failure'): void;

  // Query (called from UI)
  getLatestSnapshot(): CompilationSnapshot | undefined;
  getPassSnapshot(compileId: string, passName: string): PassSnapshot | undefined;
  search(query: string): SearchResult[];

  // Management
  clear(): void;
}
```

---

### P1: Compiler Integration ✅ COMPLETED

**Goal:** Integrate capture calls into the compilation pipeline.

**Files:**
- `src/compiler/compile.ts` (modify, +35 lines)

**Acceptance Criteria:**
- [x] Calls `compilationInspector.beginCompile()` at start
- [x] Calls `compilationInspector.capturePass()` after each pass
- [x] Calls `compilationInspector.endCompile()` on success or failure
- [x] Captures timing for each pass
- [x] Does not break existing compilation (graceful if service unavailable)
- [x] No performance impact when inspector panel is closed

**Technical Notes:**
- Add optional import of CompilationInspectorService
- Wrap capture in try-catch to avoid breaking compilation
- Capture happens synchronously after each pass completes

**Integration Pattern:**
```typescript
// At compile start
compilationInspector.beginCompile(compileId);

// After each pass
const startPass2 = performance.now();
const typedPatch = pass2TypeGraph(normalized);
compilationInspector.capturePass('type-graph', normalized, typedPatch);

// At end
compilationInspector.endCompile(status);
```

---

### P2: CompilationInspector UI Panel ✅ COMPLETED

**Goal:** Create the main UI component for viewing compilation pass outputs.

**Files:**
- `src/ui/components/CompilationInspector.tsx` (new, ~300 lines)
- `src/ui/components/IRTreeView.tsx` (new, ~360 lines)
- `src/ui/components/IRNodeDetail.tsx` (new, ~280 lines)
- `src/ui/components/CompilationInspector.css` (new, ~560 lines)

**Acceptance Criteria:**
- [x] Pass selector showing all 7 passes as tabs or dropdown
- [x] Tree view of selected pass output (collapsible nodes)
- [x] Default expansion: depth 1 (top-level keys only)
- [x] Click node to see full details in side panel
- [x] Raw JSON toggle for pass output
- [x] Shows pass timing and error count
- [x] Shows comparison indicator when 2 snapshots exist
- [x] Responsive layout that fits in Dockview panel

**Technical Notes:**
- Use InspectorContainer for consistent styling
- Use MobX observer for reactive updates
- Use CSS-only for collapse/expand (avoid tree library)
- Color-code different IR node types (signal, field, event)

**Component Structure:**
```
CompilationInspector
├── PassSelector (tabs or dropdown)
├── PassInfo (timing, errors, input/output sizes)
├── ViewToggle (Tree | JSON)
├── IRTreeView (recursive tree)
│   └── IRTreeNode (single node)
└── IRNodeDetail (selected node details)
```

---

### P3: Search Functionality ✅ COMPLETED

**Goal:** Enable searching for specific IDs across pass outputs.

**Files:**
- `src/ui/components/CompilationInspector.tsx` (modify, add search)
- `src/services/CompilationInspectorService.ts` (add search method)

**Acceptance Criteria:**
- [x] Search input at top of panel
- [x] Search for block IDs (e.g., "block-1")
- [x] Search for slot IDs (e.g., "slot:42")
- [x] Search for instance IDs (e.g., "instance-circle-1")
- [x] Highlights matching nodes in tree
- [x] Shows result count
- [x] Navigate between results with arrows

**Technical Notes:**
- Search current pass only by default
- Optionally search all passes
- Case-insensitive matching
- Use structural search (traverse object keys)

---

### P4: App Integration ✅ COMPLETED

**Goal:** Register panel with Dockview and add trigger button.

**Files:**
- `src/ui/dockview/panelRegistry.ts` (modify, +10 lines)
- `src/ui/dockview/panels/CompilationInspectorPanel.tsx` (new, ~15 lines)

**Acceptance Criteria:**
- [x] Panel registered with Dockview layout
- [x] Accessible via Debug menu or toolbar button
- [x] Panel state persists in layout
- [x] Panel can be docked, floated, or tabbed

**Technical Notes:**
- Follow existing panel registration pattern
- Add to Debug group in layout

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| DebugService pattern | ✅ Exists | Follow same singleton approach |
| InspectorContainer | ✅ Exists | Use for consistent styling |
| MobX stores | ✅ Exists | Use for reactivity |
| Dockview | ✅ Exists | Panel registration |
| compile.ts | ✅ Exists | Integration point |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Large IR tree slow to render | Medium | Lazy expansion, virtualize long arrays |
| Circular references crash JSON | Medium | Track visited nodes in replacer |
| Memory growth with history | Low | Hard limit to 2 snapshots |

---

## Verification

**Runtime Verification:**
1. Compile a patch with multiple blocks
2. Open Compilation Inspector panel
3. Verify all 7 passes appear
4. Verify pass outputs show correct structure
5. Search for a known block ID - verify it's found
6. Toggle JSON view - verify raw data displays

**Unit Tests:**
- `CompilationInspectorService.test.ts`
  - Captures all passes correctly
  - Handles circular references
  - Limits to 2 snapshots
  - Search returns correct results

---

## Implementation Order

1. ✅ **P0: Service** - Foundation for capture
2. ✅ **P1: Compiler integration** - Start capturing data
3. ✅ **P2: UI panel** - Visual verification
4. ✅ **P3: Search** - Usability enhancement
5. ✅ **P4: App integration** - Panel registration

Total lines: ~1540 new + ~45 modified

---

## Commits

1. `94888ee` - P0: Service layer (Sprint 1 - Steps 1-2)
2. `a0b10d1` - P2-P4: UI components and integration

---

## Status: ✅ COMPLETED

All planned work items delivered:
- Service layer captures all 7 passes with circular reference handling
- Compiler integration complete and non-breaking
- UI components provide full inspection capabilities
- Search functionality works across all passes
- Panel registered and accessible in bottom-left tab group
