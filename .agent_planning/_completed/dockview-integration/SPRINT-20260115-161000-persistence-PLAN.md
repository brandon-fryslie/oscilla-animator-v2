# Sprint: persistence - Layout Persistence
Generated: 2026-01-15T16:10:00
Confidence: HIGH
Status: READY FOR IMPLEMENTATION (after foundation sprint)

## Sprint Goal
Enable saving and restoring user's layout customizations globally.

## Scope

**Deliverables:**
1. LayoutStore for managing layout state
2. Auto-save on layout changes
3. Load saved layout on app start
4. Reset to default layout action
5. Layout stored in localStorage (global)

## Work Items

### P0: Create LayoutStore
**Acceptance Criteria:**
- [ ] `src/stores/LayoutStore.ts` exists
- [ ] Store has `setApi(api: DockviewApi)` method
- [ ] Store has `saveLayout()` method
- [ ] Store has `loadLayout()` method
- [ ] Store has `resetLayout()` method
- [ ] Store integrated into rootStore

**Technical Notes:**
```typescript
class LayoutStore {
  private api: DockviewApi | null = null;

  setApi(api: DockviewApi) {
    this.api = api;
    // Subscribe to layout changes
    api.onDidLayoutChange(() => this.saveLayout());
  }

  saveLayout() {
    const layout = this.api?.toJSON();
    localStorage.setItem('oscilla-layout', JSON.stringify(layout));
  }

  loadLayout(): boolean {
    const saved = localStorage.getItem('oscilla-layout');
    if (saved && this.api) {
      this.api.fromJSON(JSON.parse(saved));
      return true;
    }
    return false;
  }

  resetLayout() {
    localStorage.removeItem('oscilla-layout');
    this.api?.clear();
    applyDefaultLayout(this.api);
  }
}
```

### P1: Wire Up Auto-Save
**Acceptance Criteria:**
- [ ] Layout saves automatically when user moves/resizes panels
- [ ] Debounced to avoid excessive saves (300ms)
- [ ] No errors on rapid layout changes

**Technical Notes:**
- Use `onDidLayoutChange` event
- Debounce saves to avoid localStorage thrashing

### P2: Load on Startup
**Acceptance Criteria:**
- [ ] Saved layout loads on app refresh
- [ ] Falls back to default layout if no save exists
- [ ] Falls back to default layout if save is corrupted
- [ ] Panel components still render correctly after restore

**Technical Notes:**
- `fromJSON` requires component map to be available
- Handle JSON parse errors gracefully

### P3: Reset Layout Action
**Acceptance Criteria:**
- [ ] Reset button/action in Toolbar or menu
- [ ] Clears localStorage
- [ ] Applies default layout
- [ ] Works without page refresh

**Technical Notes:**
- Could be toolbar button or keyboard shortcut
- User should confirm before reset (optional)

## Dependencies
- Sprint: foundation (must complete first)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Corrupted layout JSON | Low | Medium | Try/catch with fallback to default |
| Missing panels in restored layout | Low | Medium | Validate panel IDs exist |
| Layout version mismatch | Medium | Low | Version the layout, clear on mismatch |

## Exit Criteria
- [ ] Move a panel, refresh page, panel stays in new position
- [ ] Resize a group, refresh page, size is preserved
- [ ] Add new tab to group, refresh, tab is still there
- [ ] Reset layout restores to default
- [ ] No console errors on load/save
