# Definition of Done: multi-patch-support

**Generated:** 2026-01-27-122000
**Status:** RESEARCH REQUIRED
**Plan:** SPRINT-2026-01-27-122000-multi-patch-support-PLAN.md

## Acceptance Criteria

### Multi-Patch Architecture Design

- [ ] Architecture document exists with:
  - Store structure decision (single vs. multiple)
  - Runtime isolation approach
  - Compilation caching strategy
  - API surface definition
- [ ] Design reviewed and approved by user

### PatchRegistry

- [ ] Class file exists at `src/stores/PatchRegistry.ts`
- [ ] Can create new patches
- [ ] Can open/close patches
- [ ] Can switch active patch
- [ ] Observable properties for reactivity
- [ ] Unit tests pass
- [ ] Integrates with existing RootStore

### Tab UI

- [ ] Tab bar renders open patches
- [ ] Clicking tab switches active patch
- [ ] Dirty indicator shows unsaved changes
- [ ] Close button with dirty check prompt
- [ ] New patch button
- [ ] Visual design matches app theme
- [ ] Keyboard shortcuts work (Cmd+W close, Cmd+1-9 switch)

### Runtime Isolation

- [ ] Each patch has independent runtime state
- [ ] Active patch renders to canvas
- [ ] Switching patches updates canvas
- [ ] Input events route to active patch
- [ ] No cross-patch state corruption

## Exit Criteria (to reach next confidence level)

### Design Phase (LOW -> MEDIUM)

- [ ] **Store architecture** decision made and documented
- [ ] **Runtime isolation** approach decided
- [ ] **Canvas allocation** strategy decided
- [ ] **Tab UI location** decided
- [ ] User approved direction before implementation

### Implementation Phase (MEDIUM -> HIGH)

- [ ] Prototype demonstrates patch switching
- [ ] Performance acceptable with 5+ patches
- [ ] No regression in single-patch mode
- [ ] Integration tests validate isolation
