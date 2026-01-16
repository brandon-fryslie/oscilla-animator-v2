# Sprint: foundation - Dockview Core Infrastructure
Generated: 2026-01-15T16:00:00
Confidence: HIGH
Status: COMPLETE (2026-01-15)

## Sprint Goal
Remove jspanel4 dead code and establish Dockview as the layout engine with all current panels migrated.

## Scope

**Deliverables:**
1. jspanel4 code completely removed
2. Dockview installed and configured
3. All 10 panels migrated to Dockview
4. Default layout matching current UI structure
5. Dark theme applied

## Work Items

### P0: Remove jspanel4 Dead Code
**Acceptance Criteria:**
- [ ] All jspanel4 files deleted (PanelManager.ts, types.ts, tests, jspanel.d.ts, AppLayout.ts, regions.ts)
- [ ] package.json has no jspanel4 or @jspanel/* dependencies
- [ ] vite.config.ts has no jspanel4 alias
- [ ] public/index.html has no jsPanel CSS overrides
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds

**Technical Notes:**
- These files are 100% unused - safe to delete
- No imports to update (nothing references them)

### P1: Install and Configure Dockview
**Acceptance Criteria:**
- [ ] `dockview` and `dockview-react` in package.json dependencies
- [ ] `npm install` succeeds
- [ ] Can import `DockviewReact` without errors

**Technical Notes:**
```bash
npm install dockview dockview-react
```

### P2: Create Dockview Infrastructure
**Acceptance Criteria:**
- [ ] `src/ui/dockview/index.ts` exports all public API
- [ ] `src/ui/dockview/DockviewProvider.tsx` wraps DockviewReact with context
- [ ] `src/ui/dockview/panelRegistry.ts` defines all 10 panels
- [ ] `src/ui/dockview/hooks.ts` exports `useDockview()` hook
- [ ] `src/ui/dockview/defaultLayout.ts` creates stacked+tabbed layout
- [ ] `src/ui/dockview/theme.css` applies dark theme
- [ ] TypeScript compiles without errors

**Technical Notes:**
- Panel registry is single source of truth for panel definitions
- DockviewContext provides global API access
- Default layout: left (2 stacked groups), center (tabbed), right (2 stacked groups), bottom

### P3: Migrate App.tsx to Use Dockview
**Acceptance Criteria:**
- [ ] App.tsx uses DockviewProvider instead of flexbox layout
- [ ] All 10 panels render correctly in Dockview
- [ ] Toolbar remains outside Dockview (at top)
- [ ] Layout matches current structure visually
- [ ] All existing functionality works (selection, editing, preview)

**Technical Notes:**
- Remove: SplitPanel, Tabs components from App.tsx layout
- Keep: Toolbar, StoreProvider, EditorProvider wrappers
- Components don't need modification - just wrapped by Dockview

### P4: Apply Dark Theme
**Acceptance Criteria:**
- [ ] Dockview tab colors match existing theme (#16213e, #0f0f23, etc.)
- [ ] Panel backgrounds match existing theme
- [ ] Borders and dividers match existing theme
- [ ] No visual jarring compared to current UI

**Technical Notes:**
- Use CSS custom properties (--dv-* variables)
- Match colors from existing index.html styles

## Default Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar (outside Dockview)                                       │
├──────────────┬───────────────────────────────┬──────────────────┤
│ [Library]    │ Blocks │ Matrix │ Rete │ Flow │ [Domains]        │
│ left-top     │ center (tabbed)               │ right-top        │
│              │                               │                  │
├──────────────┤                               ├──────────────────┤
│ [Inspector]  │                               │ [Help]           │
│ left-bottom  │                               │ right-bottom     │
├──────────────┴───────────────────────────────┴──────────────────┤
│ [Console]  bottom                                                │
└─────────────────────────────────────────────────────────────────┘
```

Groups:
- `left-top`: BlockLibrary (single panel, can add tabs)
- `left-bottom`: BlockInspector (single panel, can add tabs)
- `center`: TableView, ConnectionMatrix, ReteEditor, ReactFlowEditor, Preview (tabbed)
- `right-top`: DomainsPanel (single panel, can add tabs)
- `right-bottom`: HelpPanel (single panel, can add tabs)
- `bottom`: DiagnosticConsole (single panel, can add tabs)

## Dependencies
- None (first sprint)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Component render issues in Dockview | Low | Medium | Components are pure React, test each |
| Theme mismatch | Low | Low | CSS variables are straightforward |
| Layout sizing issues | Medium | Low | Dockview has size APIs, iterate |

## Exit Criteria
- [ ] App loads with Dockview layout
- [ ] All panels visible and functional
- [ ] No console errors
- [ ] Theme matches existing dark theme
- [ ] Build succeeds
- [ ] TypeScript compiles
