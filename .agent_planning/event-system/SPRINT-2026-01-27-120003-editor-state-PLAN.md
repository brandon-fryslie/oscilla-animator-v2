# Sprint: editor-state - Implement Editor State Coordination
Generated: 2026-01-27T12:00:03Z
Confidence: HIGH: 1, MEDIUM: 2, LOW: 1
Status: RESEARCH REQUIRED

## Sprint Goal
Implement EditorStateStore and editorStateChanged events to coordinate multiple inline editors (displayName, params, expressions) and prevent conflicting edits.

## Scope
**Deliverables:**
- EditorStateStore with active editor tracking
- Editor state events for lifecycle coordination
- Validation integration for editor validity
- UI component integration

## Work Items

### P0: Create EditorStateStore [HIGH]
**Acceptance Criteria:**
- [ ] EditorStateStore tracks active editors per location (node, inspector, dialog)
- [ ] Only one editor can be active per location
- [ ] Store exposes `canEdit(location)` check
- [ ] Store provides `startEdit()`, `endEdit()`, `updateValidity()` methods

**Technical Notes:**
- Create new store in `src/stores/`
- Should be MobX observable for UI reactivity
- Emits events via EventHub

### P1: Emit editorStateChanged events [MEDIUM]
**Acceptance Criteria:**
- [ ] `editStarted` action emits event with editor info
- [ ] `validityChanged` action emits event with isValid/error
- [ ] `editEnded` action emits event
- [ ] Events include location (node/inspector/dialog)

#### Unknowns to Resolve
- What constitutes "invalid" state for each editor type?
  - DisplayName: empty or collision
  - Expression: syntax error
  - Params: type validation failure
- How do editors report validity back to store?

#### Exit Criteria
- Define validation rules per editor type
- Design validity reporting API
- Confidence → HIGH

### P2: Wire DisplayNameEditor [MEDIUM]
**Acceptance Criteria:**
- [ ] DisplayNameEditor calls `startEdit()` on focus
- [ ] DisplayNameEditor calls `updateValidity()` on change
- [ ] DisplayNameEditor calls `endEdit()` on blur/escape
- [ ] Other editors disable when one is invalid

#### Unknowns to Resolve
- Where is DisplayNameEditor implemented?
- Does it already have validation logic?

#### Exit Criteria
- Locate DisplayNameEditor code
- Understand current validation approach
- Confidence → HIGH

### P3: Implement cross-editor coordination [LOW]
**Acceptance Criteria:**
- [ ] When one editor is invalid, others become read-only
- [ ] Escape key reverts and ends edit
- [ ] Clear error feedback shown

#### Unknowns to Resolve
- How to make ReactFlow node editors read-only?
- How to coordinate between inspector and node editors?
- What's the UX for "another editor is invalid"?

#### Exit Criteria
- Design UX for coordination states
- Prototype in one editor type
- Confidence → MEDIUM then HIGH

## Dependencies
- Sprint 1 (event-types) must be complete
- Depends on understanding current editor implementations

## Risks
- Complex UI state management
- Multiple editor types with different validation
- Potential race conditions between events
