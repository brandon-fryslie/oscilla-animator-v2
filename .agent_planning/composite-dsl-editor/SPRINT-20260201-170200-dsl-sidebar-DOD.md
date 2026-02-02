# Definition of Done: dsl-sidebar

## Acceptance Criteria

### Sidebar Component
- [ ] Toggle button in CompositeEditor header shows/hides DSL sidebar
- [ ] Sidebar renders as collapsible right-side panel within CompositeEditor
- [ ] Textarea displays current composite as HCL text
- [ ] Sidebar hidden by default

### Graph → DSL (Auto-Sync)
- [ ] Block add/remove in visual editor updates DSL text
- [ ] Edge add/remove updates DSL text
- [ ] Port exposure changes update DSL text
- [ ] Metadata changes update DSL text
- [ ] Debounced (no jank during rapid edits)
- [ ] Does NOT update while user has textarea focused (prevents cursor loss)

### DSL → Graph (Apply)
- [ ] Editing DSL and applying (blur or button) updates visual graph
- [ ] Parse errors displayed inline
- [ ] Invalid DSL does not modify editor state
- [ ] Pasting complete composite DSL replaces editor state

### Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Manual verification: create composite via visual editor, toggle DSL sidebar, verify text matches. Edit DSL, apply, verify graph matches.
