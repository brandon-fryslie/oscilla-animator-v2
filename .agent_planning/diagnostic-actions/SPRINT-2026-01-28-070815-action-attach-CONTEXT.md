# Implementation Context: Action Attachment
Generated: 2026-01-28-070815
Plan: SPRINT-2026-01-28-070815-action-attach-PLAN.md

## File Locations

### Primary File 1: Authoring Validators
**Path**: `src/diagnostics/validators/authoringValidators.ts`
**Lines to modify**:
- 87-103: E_TIME_ROOT_MISSING diagnostic creation
- 183-197: W_GRAPH_DISCONNECTED_BLOCK (disconnected TimeRoot)
- 203-217: W_GRAPH_DISCONNECTED_BLOCK (disconnected Render)
- ~220-235: W_GRAPH_DISCONNECTED_BLOCK (regular disconnected block)

### Primary File 2: Compiler Diagnostic Conversion
**Path**: `src/compiler/diagnosticConversion.ts`
**Lines to inspect**: 173-189 (type mismatch conversion)

## Existing Code Patterns

### Diagnostic Creation Pattern (E_TIME_ROOT_MISSING)
**Location**: `authoringValidators.ts:87-103`

Current code:
```typescript
return [
  {
    id,
    code: 'E_TIME_ROOT_MISSING',
    severity: 'error',
    domain: 'authoring',
    primaryTarget: target,
    title: 'No TimeRoot',
    message: 'Patch must have exactly one TimeRoot block. Add an InfiniteTimeRoot.',
    scope: { patchRevision },
    metadata: {
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      occurrenceCount: 1,
    },
    // ❌ MISSING: actions field
  },
];
```

Add `actions` field before closing brace:
```typescript
return [
  {
    id,
    code: 'E_TIME_ROOT_MISSING',
    severity: 'error',
    domain: 'authoring',
    primaryTarget: target,
    title: 'No TimeRoot',
    message: 'Patch must have exactly one TimeRoot block. Add an InfiniteTimeRoot.',
    scope: { patchRevision },
    metadata: {
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      occurrenceCount: 1,
    },
    actions: [
      {
        kind: 'createTimeRoot',
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite',
      },
    ],
  },
];
```

### Required Imports
**Location**: Top of `authoringValidators.ts`

Check existing imports - file should have:
```typescript
import type { Diagnostic } from '../types';
import { generateDiagnosticId } from '../diagnosticId';
import type { Patch } from '../../graph/Patch';
```

Add after existing imports:
```typescript
import type { 
  DiagnosticAction,
  CreateTimeRootAction, 
  GoToTargetAction, 
  RemoveBlockAction 
} from '../types';
```

Or simpler (just import parent type):
```typescript
import type { DiagnosticAction } from '../types';
```

Then use inline action objects (TypeScript will infer correct discriminated union variant).

## Implementation Steps

### Step 1: Add Actions to E_TIME_ROOT_MISSING
**Location**: `authoringValidators.ts:87-103`

In the return statement, add actions field to the diagnostic object:
```typescript
// Around line 101, before closing brace of diagnostic object
metadata: {
  firstSeenAt: Date.now(),
  lastSeenAt: Date.now(),
  occurrenceCount: 1,
},
actions: [
  {
    kind: 'createTimeRoot',
    label: 'Add InfiniteTimeRoot',
    timeRootKind: 'Infinite',
  },
],
```

### Step 2: Add Actions to W_GRAPH_DISCONNECTED_BLOCK (Instance 1)
**Location**: `authoringValidators.ts:183-197`

Current diagnostic creation (around line 183):
```typescript
diagnostics.push({
  id,
  code: 'W_GRAPH_DISCONNECTED_BLOCK',
  severity: 'warn',
  domain: 'authoring',
  primaryTarget: target,
  title: 'Disconnected TimeRoot',
  message: `TimeRoot "${block.displayName || blockId}" has no outgoing connections. Its time signals are unused.`,
  scope: { patchRevision },
  metadata: {
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    occurrenceCount: 1,
  },
  // ❌ ADD HERE
});
```

Add before closing brace:
```typescript
metadata: {
  firstSeenAt: Date.now(),
  lastSeenAt: Date.now(),
  occurrenceCount: 1,
},
actions: [
  {
    kind: 'goToTarget',
    label: 'Go to Block',
    target: { kind: 'block', blockId },
  },
  {
    kind: 'removeBlock',
    label: 'Remove Block',
    blockId,
  },
],
```

Note: `blockId` variable is already in scope (from loop or parent scope). Verify by checking lines 160-180.

### Step 3: Add Actions to W_GRAPH_DISCONNECTED_BLOCK (Instance 2)
**Location**: `authoringValidators.ts:203-217`

Same pattern as Step 2, but for disconnected Render diagnostic:
```typescript
diagnostics.push({
  id,
  code: 'W_GRAPH_DISCONNECTED_BLOCK',
  severity: 'warn',
  domain: 'authoring',
  primaryTarget: target,
  title: 'Disconnected Render',
  message: `Render "${block.displayName || blockId}" has no incoming connections. Nothing will be rendered.`,
  scope: { patchRevision },
  metadata: {
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    occurrenceCount: 1,
  },
  actions: [
    {
      kind: 'goToTarget',
      label: 'Go to Block',
      target: { kind: 'block', blockId },
    },
    {
      kind: 'removeBlock',
      label: 'Remove Block',
      blockId,
    },
  ],
});
```

### Step 4: Add Actions to W_GRAPH_DISCONNECTED_BLOCK (Instance 3)
**Location**: `authoringValidators.ts:~220-235` (exact lines may vary)

Find the third instance (regular disconnected block, not TimeRoot or Render):
```typescript
// Should be around line 218-235
} else if (!isTimeRoot && !isRenderSink) {
  // Regular block with no connections at all
  const target = { kind: 'block' as const, blockId };
  const id = generateDiagnosticId('W_GRAPH_DISCONNECTED_BLOCK', target, patchRevision);

  diagnostics.push({
    id,
    code: 'W_GRAPH_DISCONNECTED_BLOCK',
    severity: 'warn',
    domain: 'authoring',
    primaryTarget: target,
    title: 'Disconnected Block',
    message: `Block "${block.displayName || blockId}" has no connections and is unused.`,
    scope: { patchRevision },
    metadata: {
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      occurrenceCount: 1,
    },
    actions: [
      {
        kind: 'goToTarget',
        label: 'Go to Block',
        target: { kind: 'block', blockId },
      },
      {
        kind: 'removeBlock',
        label: 'Remove Block',
        blockId,
      },
    ],
  });
}
```

### Step 5: Type Mismatch Actions (Optional/Deferred)
**Location**: `src/compiler/diagnosticConversion.ts:173-189`

**First, inspect the current code** to understand structure:
```bash
# View the conversion function
cat src/compiler/diagnosticConversion.ts | sed -n '173,189p'
```

Look for:
- How compiler errors are converted to Diagnostic objects
- What information is available (error codes, edge info, port info?)
- Whether port references (blockId, portId) are accessible

**If port information is available**, add actions field when creating type mismatch diagnostics:
```typescript
// Hypothetical - actual code structure may differ
if (error.code === 'TYPE_MISMATCH') {
  return {
    id,
    code: 'E_TYPE_MISMATCH',
    severity: 'error',
    // ... other fields
    actions: [
      {
        kind: 'addAdapter',
        label: 'Insert Adapter',
        fromPort: {
          blockId: error.sourceBlockId,
          portId: error.sourcePortId,
          portKind: 'output',
        },
        adapterType: determineAdapterType(error.sourceType, error.targetType),
      },
    ],
  };
}
```

**If port information is NOT available**, document the blocker:
- Create a comment in the file noting actions cannot be added yet
- File issue or document in sprint notes: "Need compiler error enhancement to include port references"

## Adjacent Code to Follow

### Diagnostic Type Structure
The Diagnostic interface (from types.ts) has:
```typescript
interface Diagnostic {
  readonly id: string;
  readonly code: string;
  readonly severity: 'error' | 'warn' | 'info';
  readonly domain: string;
  readonly primaryTarget: TargetRef;
  readonly title: string;
  readonly message: string;
  readonly scope: { patchRevision: number };
  readonly metadata: DiagnosticMetadata;
  readonly actions?: readonly DiagnosticAction[]; // ✅ Optional array
}
```

The `actions` field is **optional** - existing diagnostics without actions continue to work.

### Variable Scoping
In `validateConnectivity` function (lines 152+):
```typescript
for (const [blockId, block] of Object.entries(patch.blocks)) {
  // blockId is in scope here
  // block is in scope here
  // Use these for actions
  
  const target = { kind: 'block' as const, blockId }; // Already constructed
  // Reuse target for goToTarget action
}
```

### Code Style
- Use `readonly` for all action fields (matches DiagnosticAction type)
- Use inline object literals (TypeScript infers discriminated union variant)
- Place actions field last in diagnostic object (after metadata)
- Use 2-space indentation (matches existing file style)

## Data Structures

### TargetRef Structure
```typescript
type TargetRef = 
  | { kind: 'block'; blockId: string }
  | { kind: 'port'; blockId: string; portId: string; portKind: 'input' | 'output' }
  | { kind: 'edge'; edgeId: string }
  | { kind: 'patch'; patchId: string }
  | { kind: 'graphSpan'; blockIds: string[]; spanKind: 'subgraph' | 'cycle' };
```

For goToTarget actions, use:
```typescript
{ kind: 'block', blockId }
```

This matches the `primaryTarget` format already used in diagnostics.

### PortTargetRef Structure
For addAdapter action, define:
```typescript
interface PortTargetRef {
  blockId: string;
  portId: string;
  portKind: 'input' | 'output';
}
```

This may need to be extracted from compiler error metadata or edge information.

## Testing Verification
After implementation:

```bash
# Run unit tests
npm test -- authoringValidators.test.ts

# Check TypeScript compilation
npx tsc --noEmit

# Verify actions exist
node -e "
const validators = require('./dist/diagnostics/validators/authoringValidators.js');
// Test diagnostics include actions
"
```

Create unit test cases:
```typescript
// In authoringValidators.test.ts
describe('Diagnostic Actions', () => {
  it('E_TIME_ROOT_MISSING includes createTimeRoot action', () => {
    const patch = createPatchWithoutTimeRoot();
    const diagnostics = validateTimeRoots(patch, 1);
    
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('E_TIME_ROOT_MISSING');
    expect(diagnostics[0].actions).toHaveLength(1);
    expect(diagnostics[0].actions![0].kind).toBe('createTimeRoot');
    expect(diagnostics[0].actions![0].label).toBe('Add InfiniteTimeRoot');
  });

  it('W_GRAPH_DISCONNECTED_BLOCK includes goToTarget and removeBlock actions', () => {
    const patch = createPatchWithDisconnectedBlock();
    const diagnostics = validateConnectivity(patch, 1);
    
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('W_GRAPH_DISCONNECTED_BLOCK');
    expect(diagnostics[0].actions).toHaveLength(2);
    expect(diagnostics[0].actions![0].kind).toBe('goToTarget');
    expect(diagnostics[0].actions![1].kind).toBe('removeBlock');
  });
});
```
