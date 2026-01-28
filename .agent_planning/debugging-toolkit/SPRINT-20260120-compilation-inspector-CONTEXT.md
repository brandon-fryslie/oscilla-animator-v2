# Implementation Context: Compilation Pipeline Inspector

**Sprint:** compilation-inspector
**Date:** 2026-01-20

---

## Quick Reference

### Key Files

| Purpose | File |
|---------|------|
| Compiler entry point | `src/compiler/compile.ts` |
| Pass 2-7 implementations | `src/compiler/passes-v2/*.ts` |
| Normalization | `src/graph/normalize.ts` |
| DebugService pattern | `src/services/DebugService.ts` |
| Inspector container | `src/ui/components/InspectorContainer.tsx` |
| BlockInspector example | `src/ui/components/BlockInspector.tsx` |
| IR types | `src/compiler/ir/types.ts` |
| Patch types | `src/compiler/ir/patches.ts` |

### Pass Names and Types

```typescript
// Pass names for capturePass()
const PASS_NAMES = [
  'normalization',   // NormalizedPatch
  'type-graph',      // TypedPatch
  'time',            // TimeResolvedPatch
  'depgraph',        // DepGraphWithTimeModel
  'scc',             // AcyclicOrLegalGraph
  'block-lowering',  // UnlinkedIRFragments
  'schedule',        // ScheduleIR
] as const;
```

---

## Existing Patterns to Follow

### Singleton Service Pattern (from DebugService.ts)

```typescript
class CompilationInspectorService {
  private snapshots: CompilationSnapshot[] = [];
  // ... methods
}

export const compilationInspector = new CompilationInspectorService();
```

### MobX Observable Pattern

```typescript
import { makeAutoObservable, observable, action } from 'mobx';

class CompilationInspectorService {
  @observable snapshots: CompilationSnapshot[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  @action capturePass(name: string, input: unknown, output: unknown): void {
    // ... modify snapshots
  }
}
```

### React + MobX Observer Pattern (from BlockInspector.tsx)

```typescript
import { observer } from 'mobx-react-lite';

export const CompilationInspector: React.FC = observer(() => {
  const { snapshots } = compilationInspector;
  // ... render
});
```

### InspectorContainer Usage

```typescript
<InspectorContainer
  title="Compilation Inspector"
  category="Debug"
  color="#8e44ad"  // Purple for debug tools
>
  {/* Panel content */}
</InspectorContainer>
```

---

## Circular Reference Handling

IR structures may contain circular references. Use this pattern:

```typescript
function serializeIR(value: unknown): unknown {
  const visited = new WeakSet();

  function replacer(key: string, val: unknown): unknown {
    if (val !== null && typeof val === 'object') {
      if (visited.has(val as object)) {
        return '[Circular]';
      }
      visited.add(val as object);
    }

    // Handle functions
    if (typeof val === 'function') {
      return '[Function]';
    }

    // Handle PureFn objects
    if (val && typeof val === 'object' && 'kind' in val) {
      const fn = val as { kind: string };
      if (fn.kind === 'opcode' || fn.kind === 'kernel' || fn.kind === 'expr') {
        return { kind: fn.kind, name: (val as any).name || 'anonymous' };
      }
    }

    return val;
  }

  return JSON.parse(JSON.stringify(value, replacer));
}
```

---

## Compiler Integration Points

In `compile.ts`, add captures at these locations:

```typescript
// Line ~112: After normalization
const normalized = normResult.patch;
compilationInspector.capturePass('normalization', patch, normalized);

// Line ~159: After pass 2
const typedPatch = pass2TypeGraph(normalized);
compilationInspector.capturePass('type-graph', normalized, typedPatch);

// Line ~162: After pass 3
const timeResolvedPatch = pass3Time(typedPatch);
compilationInspector.capturePass('time', typedPatch, timeResolvedPatch);

// Line ~165: After pass 4
const depGraphPatch = pass4DepGraph(timeResolvedPatch);
compilationInspector.capturePass('depgraph', timeResolvedPatch, depGraphPatch);

// Line ~168: After pass 5
const acyclicPatch = pass5CycleValidation(depGraphPatch);
compilationInspector.capturePass('scc', depGraphPatch, acyclicPatch);

// Line ~175: After pass 6
const unlinkedIR = pass6BlockLowering(acyclicPatch, options);
compilationInspector.capturePass('block-lowering', acyclicPatch, unlinkedIR);

// Line ~188: After pass 7
const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch);
compilationInspector.capturePass('schedule', unlinkedIR, scheduleIR);
```

---

## IR Type Summary

### NormalizedPatch
```typescript
{
  blocks: Map<BlockId, NormalizedBlock>;
  edges: Edge[];
  adapters: Adapter[];
  blockIndex: { ... };
}
```

### TypedPatch
```typescript
NormalizedPatch & {
  blockOutputTypes: Map<BlockId, Map<PortId, CanonicalType>>;
}
```

### TimeResolvedPatch
```typescript
TypedPatch & {
  timeModel: TimeModel;
  timeSignals: TimeSignal[];
}
```

### DepGraphWithTimeModel
```typescript
{
  blocks: Map<BlockId, NormalizedBlock>;
  edges: Edge[];
  depGraph: DepGraph;
  timeModel: TimeModel;
}
```

### UnlinkedIRFragments
```typescript
{
  builder: IRBuilder;  // Contains signalExprs, fieldExprs, eventExprs
  blockOutputs: Map<BlockId, BlockOutputMap>;
  errors: LoweringError[];
}
```

### ScheduleIR
```typescript
{
  phases: Phase[];  // signal, field, continuity, render, state
  steps: Step[];
}
```

---

## CSS Variables (from existing components)

```css
/* Colors */
--inspector-accent-color: #8e44ad;  /* Purple for debug */
--bg-primary: #1e1e1e;
--bg-secondary: #252526;
--text-primary: #e0e0e0;
--text-secondary: #888;
--border-color: #333;

/* Spacing */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
```

---

## Search Implementation Hint

```typescript
interface SearchResult {
  passName: string;
  path: string[];      // JSON path to match
  key: string;         // Matched key
  value: unknown;      // Matched value
}

function searchIR(obj: unknown, query: string, path: string[] = []): SearchResult[] {
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  function traverse(val: unknown, currentPath: string[]): void {
    if (val === null || val === undefined) return;

    if (typeof val === 'string' && val.toLowerCase().includes(lowerQuery)) {
      results.push({ path: currentPath, key: currentPath.at(-1) || '', value: val });
    }

    if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        if (k.toLowerCase().includes(lowerQuery)) {
          results.push({ path: [...currentPath, k], key: k, value: v });
        }
        traverse(v, [...currentPath, k]);
      }
    }
  }

  traverse(obj, path);
  return results;
}
```

---

## Dockview Panel Registration

```typescript
// In App.tsx or layout configuration
dockviewApi.addPanel({
  id: 'compilation-inspector',
  component: 'compilation-inspector',
  title: 'Compilation Inspector',
  position: { direction: 'right' },
});

// Register component
dockviewApi.registerComponent('compilation-inspector', CompilationInspector);
```

---

## Testing Hints

```typescript
describe('CompilationInspectorService', () => {
  beforeEach(() => {
    compilationInspector.clear();
  });

  it('captures all 7 passes', () => {
    compilationInspector.beginCompile('test-1');
    compilationInspector.capturePass('normalization', {}, { blocks: [] });
    // ... capture other passes
    compilationInspector.endCompile('success');

    expect(compilationInspector.getLatestSnapshot()?.passes.length).toBe(7);
  });

  it('limits to 2 snapshots', () => {
    // First compile
    compilationInspector.beginCompile('test-1');
    compilationInspector.endCompile('success');

    // Second compile
    compilationInspector.beginCompile('test-2');
    compilationInspector.endCompile('success');

    // Third compile
    compilationInspector.beginCompile('test-3');
    compilationInspector.endCompile('success');

    expect(compilationInspector.snapshots.length).toBe(2);
    expect(compilationInspector.snapshots[0].compileId).toBe('test-2');
  });

  it('handles circular references', () => {
    const circular: any = { a: 1 };
    circular.self = circular;

    compilationInspector.beginCompile('test');
    compilationInspector.capturePass('test', {}, circular);
    compilationInspector.endCompile('success');

    const snapshot = compilationInspector.getLatestSnapshot();
    expect((snapshot?.passes[0].output as any).self).toBe('[Circular]');
  });
});
```

---

## Component Props Reference

### IRTreeView Props
```typescript
interface IRTreeViewProps {
  data: unknown;
  defaultExpandDepth?: number;  // Default: 1
  onNodeSelect?: (path: string[], value: unknown) => void;
  highlightPaths?: string[][];  // For search results
}
```

### IRNodeDetail Props
```typescript
interface IRNodeDetailProps {
  path: string[];
  value: unknown;
  onClose?: () => void;
}
```

---

## Don't Forget

1. **Import order:** Keep imports alphabetical per existing patterns
2. **Error boundaries:** Wrap tree view in error boundary for safety
3. **Loading state:** Show skeleton while serializing large IR
4. **Null checks:** Service may not have snapshots yet
5. **Cleanup:** Clear snapshots when patch is unloaded
