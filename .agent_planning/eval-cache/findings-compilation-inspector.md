# Eval Cache: Compilation Inspector

**Scope:** work/compilation-inspector
**Last Updated:** 2026-01-20 22:19:03
**Status:** COMPLETE - All automated quality gates passed

## Runtime Findings

### Service Architecture
- **Singleton pattern:** `compilationInspector` exported from service file
- **MobX reactive:** `makeAutoObservable(this)` in constructor
- **Memory bounded:** Max 2 snapshots enforced in `endCompile()`
- **Error isolation:** All captures wrapped in try-catch, don't break compilation

### Compiler Integration Pattern
- **7 capture points:** One after each pass completes
- **Lifecycle calls:** `beginCompile()` at start, `endCompile()` on success/failure
- **Synchronous capture:** Captures happen immediately after each pass
- **Failure handling:** `endCompile('failure')` stops capture on error

### JSON Serialization (serializeIR)
- **Circular refs:** WeakSet tracking prevents infinite loops, replaces with `'[Circular]'`
- **Functions:** Replaced with `'[Function]'` string
- **Maps:** Serialized to `{ __type: 'Map', entries: {...} }`
- **Sets:** Serialized to `{ __type: 'Set', values: [...] }`

### UI Component Structure
- **CompilationInspector.tsx:** Main panel with pass selector, tree view, search
- **IRTreeView.tsx:** Recursive tree component with expand/collapse
- **IRNodeDetail.tsx:** Detail panel for selected nodes
- **Panel integration:** Registered in panelRegistry as 'compilation-inspector'

### Known Patterns
- **Pass timing:** Uses `performance.now()` for high-precision timing
- **Size estimation:** `JSON.stringify(obj).length` for input/output size
- **Default expand depth:** Tree auto-expands to depth 1
- **Search:** Recursive traversal with path tracking

## Test Coverage (47 tests, all passing)

### Comprehensive Coverage
- Basic lifecycle (7 tests): beginCompile, endCompile, status tracking
- Pass capture (7 tests): All 7 passes, timing, size estimation
- Circular refs (4 tests): Handles without crashing
- Function serialization (3 tests): Replaces with '[Function]'
- Map/Set serialization (4 tests): Custom serialization format
- Memory management (3 tests): Max 2 snapshots enforced
- Search functionality (8 tests): ID search, path matching
- Error handling (5 tests): Warns on invalid lifecycle
- Snapshot queries (6 tests): getLatestSnapshot, getPassSnapshot

### Test File Location
`src/services/CompilationInspectorService.test.ts` (831 lines)

## Automated Quality Gates

### All Passed ✅
- **TypeScript compilation:** 0 errors (verified `npm run typecheck`)
- **Test suite:** 509/509 tests passing
- **Build:** Production bundle created successfully
- **Code patterns:** Follows DebugService singleton pattern

### Fixed Issues
- **TypeScript error (commit 3ed1525):** Added `expect(pass).toBeDefined()` before non-null assertion in test
- **Test coverage:** 47 comprehensive tests added (831 lines)

## Reusable Patterns

### Service Integration
When integrating with compiler:
1. Import service singleton
2. Call `beginCompile(compileId)` at start
3. Wrap `capturePass()` calls in try-catch
4. Call `endCompile('success' | 'failure')` at end

### Custom JSON Serialization
When handling IR with special types:
1. Use WeakSet for circular ref tracking
2. Check for circular first, replace with marker
3. Handle function/Map/Set with custom serialization
4. Use `__type` field for structured data types

### MobX Reactive UI
When building observer components:
1. Import `observer` from mobx-react-lite
2. Wrap component: `export const Comp = observer(() => {...})`
3. Access service properties directly (MobX tracks)
4. Use `useMemo` for expensive computations

## Files Modified
- `src/services/CompilationInspectorService.ts` (390 lines)
- `src/services/CompilationInspectorService.test.ts` (831 lines)
- `src/compiler/compile.ts` (10 integration points)
- `src/ui/components/CompilationInspector.tsx` (293 lines)
- `src/ui/components/IRTreeView.tsx` (398 lines)
- `src/ui/components/IRNodeDetail.tsx` (277 lines)
- `src/ui/components/CompilationInspector.css` (styles)
- `src/ui/dockview/panels/CompilationInspectorPanel.tsx` (panel wrapper)
- `src/ui/dockview/panelRegistry.ts` (panel registration)

## Optional User Runtime Testing

**Not blocking completion, but recommended for UX confidence:**
- Q5: Tree render time <100ms (LOW risk - standard React patterns)
- Q6: Search results <50ms (LOW risk - simple traversal)
- Q7: Memory leaks (LOW risk - bounded snapshots, MobX cleanup)
- Manual testing checklist (8 steps in DoD)

**How to test:**
1. `npm run dev`
2. Create 10-50 block patch
3. Open Compilation Inspector panel
4. Verify passes, search, tree view work
5. Chrome DevTools for performance/memory profiling

## Confidence Decay

- **FRESH:** Until CompilationInspectorService.ts or compile.ts changes
- **RECENT:** After minor UI changes (CompilationInspector.tsx)
- **RISKY:** If compiler pass structure changes
- **STALE:** If IR data structures change significantly
