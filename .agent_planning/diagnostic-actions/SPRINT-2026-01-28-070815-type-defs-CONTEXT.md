# Implementation Context: Type Definitions
Generated: 2026-01-28-070815
Plan: SPRINT-2026-01-28-070815-type-defs-PLAN.md

## File Locations

### Primary File
**Path**: `src/diagnostics/types.ts`
**Lines**: 171-186 (current stub to replace)

## Existing Code Patterns

### Current Stub Implementation
```typescript
// Lines 171-186 in src/diagnostics/types.ts
export interface DiagnosticAction {
  readonly id: string; // ❌ Remove - not in spec
  readonly label: string; // ✅ Keep - needed for UI
  readonly kind: 'automated' | 'guided'; // ❌ Replace with discriminated union
  readonly payload?: unknown; // ❌ Remove - use typed fields per variant
}
```

### Required Imports (already in file)
Check if these exist, add if missing:
```typescript
import type { TargetRef, PortTargetRef } from './types';
// OR they may be defined in the same file
```

Look for existing type definitions around lines 1-170 for:
- `TargetRef` - should exist (used in Diagnostic type)
- `PortTargetRef` - may need to be defined or imported from graph types

### Type Definition Structure in File
The file follows this pattern:
1. Imports (top)
2. Type definitions in logical groups
3. Interfaces with JSDoc
4. Export statements

Match this pattern for the new DiagnosticAction type.

## Implementation Steps

### Step 1: Replace Interface with Discriminated Union
**Location**: `src/diagnostics/types.ts:171-186`

Replace the entire block with:

```typescript
/**
 * DiagnosticAction represents an automated or user-initiated fix for a diagnostic issue.
 * 
 * Actions follow the Action Determinism Contract:
 * - Serializable: Can be sent over network or saved to disk
 * - Replayable: Same action + same state = same result
 * - Safe: All references by ID, not mutable object pointers
 * 
 * Each action variant must specify:
 * - Exact targets (by ID)
 * - Exact operation parameters
 * - User-facing label for UI buttons
 * 
 * @see design-docs/.../07-diagnostics-system.md:368-379 for spec
 * @see design-docs/.../07-diagnostics-system.md:835-854 for Action Determinism Contract
 */
export type DiagnosticAction =
  | GoToTargetAction
  | InsertBlockAction
  | RemoveBlockAction
  | AddAdapterAction
  | CreateTimeRootAction
  | MuteDiagnosticAction
  | OpenDocsAction;

/**
 * Navigate to a specific target in the UI (block, port, edge, etc.)
 * @example
 * { kind: 'goToTarget', label: 'Go to Block', target: { kind: 'block', blockId: 'abc123' } }
 */
export interface GoToTargetAction {
  readonly kind: 'goToTarget';
  readonly label: string;
  readonly target: TargetRef;
}

/**
 * Insert a new block into the patch.
 * @example
 * { kind: 'insertBlock', label: 'Add InfiniteTimeRoot', blockType: 'InfiniteTimeRoot' }
 */
export interface InsertBlockAction {
  readonly kind: 'insertBlock';
  readonly label: string;
  readonly blockType: string;
  readonly position?: 'before' | 'after';
  readonly nearBlockId?: string;
}

/**
 * Remove a block from the patch.
 * @example
 * { kind: 'removeBlock', label: 'Remove Disconnected Block', blockId: 'abc123' }
 */
export interface RemoveBlockAction {
  readonly kind: 'removeBlock';
  readonly label: string;
  readonly blockId: string;
}

/**
 * Add an adapter block between two ports to fix type mismatches.
 * @example
 * { kind: 'addAdapter', label: 'Insert Adapter', fromPort: {...}, adapterType: 'SignalToValue' }
 */
export interface AddAdapterAction {
  readonly kind: 'addAdapter';
  readonly label: string;
  readonly fromPort: PortTargetRef;
  readonly adapterType: string;
}

/**
 * Create a time root block (required for patch execution).
 * @example
 * { kind: 'createTimeRoot', label: 'Add InfiniteTimeRoot', timeRootKind: 'Infinite' }
 */
export interface CreateTimeRootAction {
  readonly kind: 'createTimeRoot';
  readonly label: string;
  readonly timeRootKind: 'Infinite';
}

/**
 * Mute/hide a specific diagnostic (user dismissal).
 * @example
 * { kind: 'muteDiagnostic', label: 'Mute Warning', diagnosticId: 'diag-xyz' }
 */
export interface MuteDiagnosticAction {
  readonly kind: 'muteDiagnostic';
  readonly label: string;
  readonly diagnosticId: string;
}

/**
 * Open documentation in external browser or help panel.
 * @example
 * { kind: 'openDocs', label: 'Learn More', docUrl: 'https://docs.example.com/signals' }
 */
export interface OpenDocsAction {
  readonly kind: 'openDocs';
  readonly label: string;
  readonly docUrl: string;
}
```

### Step 2: Add Type Guards
**Location**: `src/diagnostics/types.ts` (add after DiagnosticAction types)

Add these functions immediately after the action type definitions:

```typescript
// =============================================================================
// Type Guards for DiagnosticAction
// =============================================================================

export function isGoToTargetAction(action: DiagnosticAction): action is GoToTargetAction {
  return action.kind === 'goToTarget';
}

export function isInsertBlockAction(action: DiagnosticAction): action is InsertBlockAction {
  return action.kind === 'insertBlock';
}

export function isRemoveBlockAction(action: DiagnosticAction): action is RemoveBlockAction {
  return action.kind === 'removeBlock';
}

export function isAddAdapterAction(action: DiagnosticAction): action is AddAdapterAction {
  return action.kind === 'addAdapter';
}

export function isCreateTimeRootAction(action: DiagnosticAction): action is CreateTimeRootAction {
  return action.kind === 'createTimeRoot';
}

export function isMuteDiagnosticAction(action: DiagnosticAction): action is MuteDiagnosticAction {
  return action.kind === 'muteDiagnostic';
}

export function isOpenDocsAction(action: DiagnosticAction): action is OpenDocsAction {
  return action.kind === 'openDocs';
}
```

### Step 3: Verify Imports
**Location**: Top of `src/diagnostics/types.ts`

Ensure these types are imported or defined:
- `TargetRef` - should already exist in this file or imported
- `PortTargetRef` - check if defined, may need to add:

If `PortTargetRef` doesn't exist, define it as:
```typescript
/**
 * Reference to a specific port on a block.
 */
export interface PortTargetRef {
  readonly blockId: string;
  readonly portId: string;
  readonly portKind: 'input' | 'output';
}
```

## Adjacent Code to Follow

### Diagnostic Type (lines ~190-240)
The Diagnostic interface uses:
```typescript
export interface Diagnostic {
  // ...
  readonly actions?: readonly DiagnosticAction[]; // Optional array of actions
}
```

This should continue to work - `actions` is optional, and our new type is compatible.

### Module Boundaries
File: `src/diagnostics/types.ts`
- Export all public types
- Keep internal helpers private (if any)
- No imports from implementation files (validators, executor) - only from core types

### Code Style
- Use `readonly` for all fields
- Use JSDoc for all public types
- Use `@example` tags for complex types
- Use explicit interface names (not inline object types in union)

## Testing Verification
After implementation, verify with:

```bash
# Compile to check types
npm run build

# Or just type-check
npx tsc --noEmit
```

Look for:
- ✅ No type errors in diagnostics/types.ts
- ✅ Diagnostic interface still compiles (actions field)
- ✅ No errors in files that import Diagnostic

## Data Structures

### TargetRef Structure (existing)
Should already be defined in this file around lines 100-150 as:
```typescript
type TargetRef = 
  | { kind: 'block'; blockId: string }
  | { kind: 'port'; blockId: string; portId: string }
  | { kind: 'edge'; edgeId: string }
  | { kind: 'patch'; patchId: string }
  // ... possibly more variants
```

Use this exact structure for the `target` field in `GoToTargetAction`.

### Type Relationship
```
DiagnosticAction (union)
├─ GoToTargetAction
├─ InsertBlockAction
├─ RemoveBlockAction
├─ AddAdapterAction
├─ CreateTimeRootAction
├─ MuteDiagnosticAction
└─ OpenDocsAction

Diagnostic
└─ actions?: readonly DiagnosticAction[]
```

Each Diagnostic can have 0+ actions. Actions are immutable (readonly).
