# Sprint: Type Definitions - Foundation Types
Generated: 2026-01-28-070815
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-070441.md

## Sprint Goal
Replace stub DiagnosticAction interface with spec-compliant discriminated union and add UI label field.

## Scope
**Deliverables:**
- Spec-compliant DiagnosticAction type (7 action kinds)
- TypeScript compilation verification
- Type safety for all action kinds

## Work Items

### P0: Replace Generic DiagnosticAction with Discriminated Union
**Confidence**: HIGH
**Dependencies**: None
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 41-55

#### Description
Replace the current generic `DiagnosticAction` interface (types.ts:181-186) with the spec-defined discriminated union. Current implementation uses `kind: 'automated' | 'guided'` with generic `payload?: unknown`. Spec requires 7 specific action kinds with strongly-typed payloads.

Current stub:
```typescript
export interface DiagnosticAction {
  readonly id: string;
  readonly label: string;
  readonly kind: 'automated' | 'guided';
  readonly payload?: unknown;
}
```

Must become:
```typescript
type DiagnosticAction =
  | { kind: 'goToTarget'; label: string; target: TargetRef }
  | { kind: 'insertBlock'; label: string; blockType: string; position?: 'before' | 'after'; nearBlockId?: string }
  | { kind: 'removeBlock'; label: string; blockId: string }
  | { kind: 'addAdapter'; label: string; fromPort: PortTargetRef; adapterType: string }
  | { kind: 'createTimeRoot'; label: string; timeRootKind: 'Infinite' }
  | { kind: 'muteDiagnostic'; label: string; diagnosticId: string }
  | { kind: 'openDocs'; label: string; docUrl: string };
```

#### Acceptance Criteria
- [ ] DiagnosticAction is defined as discriminated union with 7 variants
- [ ] Each variant has strongly-typed fields (no `unknown` or `any`)
- [ ] All variants include `label: string` field for UI button text
- [ ] TypeScript compilation succeeds with no errors
- [ ] Existing diagnostic types still compile (actions field is optional)

#### Technical Notes
- File: `src/diagnostics/types.ts:171-186`
- Remove `id` field (not needed - actions are ephemeral, diagnostic has the ID)
- Keep `label` field across all variants for UI rendering
- Import `TargetRef` and `PortTargetRef` types if not already imported
- This is purely a type change - no runtime behavior yet

---

### P0: Add Type Guards for Action Discrimination
**Confidence**: HIGH
**Dependencies**: P0 (Replace Generic DiagnosticAction)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 41-55

#### Description
Create TypeScript type guard functions to safely discriminate between action kinds. These will be needed by the action executor (Sprint 2) and UI components (Sprint 3).

```typescript
export function isGoToTargetAction(action: DiagnosticAction): action is Extract<DiagnosticAction, { kind: 'goToTarget' }> {
  return action.kind === 'goToTarget';
}

export function isInsertBlockAction(action: DiagnosticAction): action is Extract<DiagnosticAction, { kind: 'insertBlock' }> {
  return action.kind === 'insertBlock';
}
// ... 5 more guards
```

#### Acceptance Criteria
- [ ] Type guard function exists for each of the 7 action kinds
- [ ] Each guard returns narrowed type using TypeScript's `is` keyword
- [ ] Guards are exported from types.ts for use in other modules
- [ ] TypeScript correctly narrows types when guards are used in if statements

#### Technical Notes
- File: `src/diagnostics/types.ts` (add after DiagnosticAction type)
- These are pure type-level constructs - zero runtime overhead
- Export all guards for use in actionExecutor.ts and DiagnosticConsole.tsx
- Consider using a switch statement pattern instead if executor prefers that

---

### P1: Add JSDoc Documentation for Action Types
**Confidence**: HIGH
**Dependencies**: P0 (Replace Generic DiagnosticAction)
**Spec Reference**: 07-diagnostics-system.md:835-854 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 203-209

#### Description
Add comprehensive JSDoc comments explaining each action kind, its purpose, when it's used, and examples. This documentation serves as the contract for action creators (validators) and action executors.

#### Acceptance Criteria
- [ ] DiagnosticAction type has JSDoc explaining discriminated union pattern
- [ ] Each action kind has JSDoc with purpose and example
- [ ] Action Determinism Contract requirements are documented (serializable, replayable, safe)
- [ ] JSDoc includes `@example` tags showing typical usage

#### Technical Notes
- Reference spec lines 835-854 for Action Determinism Contract
- Emphasize that all references are by ID, not mutable objects
- Document that actions are serializable (can be sent over network)
- Mention that actions will eventually integrate with undo/redo

---

## Dependencies
None - this sprint has no external dependencies. Type definitions are foundational.

## Risks
**Risk**: Type changes break existing code  
**Mitigation**: Current usage is zero - only type definition exists, no implementations  
**Likelihood**: Very Low

**Risk**: Spec-defined types are insufficient for real use cases  
**Mitigation**: Spec types are explicit and comprehensive, covering all planned actions  
**Likelihood**: Very Low
