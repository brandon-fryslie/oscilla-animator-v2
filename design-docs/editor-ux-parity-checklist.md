# Editor UX Parity Checklist (`oscilla-editor-ux-8lsn`)

**Status:** living instrument · **Owner ticket:** `oscilla-editor-ux-8lsn.24` · **Gates:** legacy-delete tranche 3 (UI clause = "delete the V1 providers")

This is the epic's **exit instrument**. One row per surface in the epic's verified parity
inventory. Every row carries exactly one disposition and, for shared rows, a concrete
**side-by-side gate** (`?v1=true` vs default scene boot). No surface is silently dropped.
[LAW:no-silent-failure] [LAW:verifiable-goals]

The parity **baseline** is the V1 editor surface (booted via `?v1=true`, ~9k lines under
`reactFlowEditor` / `graphEditor` / `components`). The **target** is the default scene/pillar
boot. Both eras now render ONE shared shell — `EditorWorkspace` (Toolbar + Dockview),
selected as a value by `resolveEditorEra(boot)` in `src/ui/components/app/editorEra.tsx`
(the era IS the value; no `if (era === 'v1')` at the mount site). [LAW:dataflow-not-control-flow]

## Disposition vocabulary

The three the ticket names, plus the two the actual epic state requires (a mid-migration
epic has in-flight rows that are neither shipped nor abandoned — collapsing them into
"shipped" or "wontfix" would itself be a silent drop):

| Disposition | Meaning |
|---|---|
| **shipped-as-shared** | One component serves BOTH eras over a neutral seam. Row carries a side-by-side gate. Closed. |
| **shipped-scene-native** | Scene era has a working pillar-native equivalent (not the same component, but full function). Row carries a scene gate; V1 provider deleted at tranche 3. |
| **remaining-ticketed** | Not yet at parity in the scene boot; owned by a specific OPEN editor-ux ticket. Explicit, not dropped. Blocks full epic exit. |
| **superseded-with-owner** | V1-only surface with no scene equivalent by design; a NAMED non-editor-ux epic owns the replacement (one-era code gets no seam — [LAW:composability]). |
| **wontfix-with-reason** | No scene equivalent and none planned; the reason is a model fact, not an omission. |

**Side-by-side gate (definition):** boot `?v1=true`, perform interaction X, observe result Y;
boot default, perform the same interaction X, observe the same result Y. A shared row "has its
gate" when that comparison is defined and executable today.

## The checklist

### Shipped

| # | Surface | Disposition | Evidence / seam | Side-by-side gate |
|---|---|---|---|---|
| 1 | Dockview docking + layout persistence | **shipped-as-shared** | `.20` unified boot; both eras mount `EditorWorkspace`→`DockviewProvider` with an `EditorLayoutPolicy` (`v1LayoutPolicy` / `sceneLayoutPolicy`, `layoutPolicies.ts`). Per-era persistence slot (`DOCKVIEW_LAYOUT_STORAGE_KEY` vs `SCENE_DOCKVIEW_LAYOUT_STORAGE_KEY`). | Both boots: dock/float/reset panels via Layout+Panels menus; reload → panel layout restored. **Caveat:** pillar graph NODE positions live in `PillarPatchAdapter`'s in-memory `observable.map`, NOT persisted across navigation (`SceneGraphEditorPanel` re-seeds deterministic L→R each mount). Tracked as the `.14`-spike residual — see row 17. |
| 2 | Undo / redo | **shipped-as-shared** | `.21` — one `GraphHistoryStore` via `useGraphHistoryBinding`; V1 binds `PatchStoreAdapter`, scene binds `PillarPatchAdapter`. History HOTKEYS are era-neutral, mounted for BOTH at `App.tsx` (`useHistoryHotkeys`). | Both boots: make an edit → Ctrl+Z reverts → Ctrl+Shift+Z re-applies; a compound op (duplicate) collapses to one undo. |
| 3a | Hotkeys — history + canvas clipboard | **shipped-as-shared** | Undo/redo keys via `App.tsx`→`useHistoryHotkeys` (both); copy/paste/duplicate/select-all/escape via `GraphEditorCore` canvas `onKeyDown` (both). | Both boots: select-all → duplicate → one undo; copy → paste round-trips. |
| 6a | Port info popover + wiring type validation | **shipped-as-shared** | `PortInfoPopover` rendered in the shared `UnifiedNode` (both boots); `GraphEditorCore.isValidConnection` asks the injected `TypeOracle` — `.17` seam, `SceneTypeOracle` (scene) vs V1 oracle. | Both boots: hover/pin a port → type popover; drag an incompatible wire → rejected identically. |
| 7a | ParameterControls + LensParamControls | **shipped-as-shared** | `.23` — one `NeutralParamControl` widget over one neutral control vocab (`ParamData`; `DetailControl` is an alias), driven by an era-neutral `apply:(value)=>void` closure. V1-coupled `reactFlowEditor/ParameterControls.tsx` DELETED. | Both boots: edit a block/config control inline (slider/int/select/boolean/color/xy) → value commits (scene → `PillarPatchStore.updateConfig`; V1 → `updateControlValue`) and sibling projections reflect it. |
| 9a | BlockInspector / EdgeInspector / InspectorContainer (detail BODY) | **shipped-as-shared** | `.19` selection-detail seam — `SceneInspectorPanel` renders the ONE neutral `SelectionDetailView`; era's `SelectionDetail` supplied via provider (`V1SelectionDetail` / `SceneSelectionDetail`). | Both boots: select a block → inspector shows its neutral facts + editable controls; select an edge → edge detail. (Panel-set COMPLETENESS — additional edge/block panels — is remaining; see row 10.) |
| 14 | TableView (modulation table) | **shipped-scene-native** | `.20` — `SceneModulationTablePanel` → pillar-native `ModulationTablePanel` over `PillarPatchStore`; an alternate projection of the same authored patch. V1 has `table-view`. | Both boots: open the Table panel; routing edits round-trip with the graph view (no state moves on switch). |

### Remaining (owned by an open editor-ux ticket — blocks full epic exit)

| # | Surface | Owner | Current scene state |
|---|---|---|---|
| 3b | Hotkey registry (full command set) | **`.8`** | Beyond the history + canvas-clipboard keys already shared (row 3a), the FULL `useGlobalHotkeys` registry is mounted V1-only (inside `V1EditorShell`); `SceneEditorShell` omits it. Deliberate: the V1 registry acts on the V1 `PatchStore`/`EditorHandle`; wiring it to a pillar selection would silently no-op. Needs an `EditorHandle` over `PillarPatchAdapter` (or era-neutral registry commands at the mutation boundary). [LAW:no-silent-failure] |
| 4 + 5 | ContextMenu + ConnectionPicker / ConnectionMatrix | **`.4`** | No canvas context menu in scene (`SceneGraphEditorPanel` mounts `GraphEditorCore` without `onNode/Edge/PortContextMenu` handlers). Partial: `NativeEditorPanel` (scene palette body) already hosts an in-panel connection `<select>`; the V1 `ConnectionMatrix` dock panel has no scene equivalent. (`ConnectionPicker` is orphaned V1 code — see delete-candidates.) |
| 6b | EdgeInfoPopover | **`.5`** | Port popover + type validation already shared (row 6a). The remaining gap: `EdgeInfoPopover` is rendered only in `ReactFlowEditor` (V1); not on the scene edge. |
| 8 | BlockLibrary (block palette with search) | **`.7`** | `ScenePalettePanel` → `NativeEditorPanel` gives a WORKING pillar add-block palette, but not the catalog-driven searchable `BlockLibrary`. Catalog seam `.16` (`sceneBlockCatalog`) is the substrate. |
| 9b | Inspector panel completeness (block + edge dockview panels) | **`.10`** | Detail BODY shipped (row 9a); the fuller per-selection dockview panel set is the remaining growth. |
| 10 | ExpressionEditorWorkbench / SharedExpressionEditor | **`.12`** | No scene expression editor. `.12` is explicitly a DISPOSITION ticket (may resolve to superseded/wontfix once the pillar expression story is decided). |

### Superseded (V1-only by design — a named non-editor-ux epic owns the replacement)

| # | Surface | Owner epic | Reason |
|---|---|---|---|
| 11 | CompositeEditor (+ DSL sidebar) | `oscilla-scene-composites-d0d5` | **`.11` PROBE disposition (2026-07-10).** Composites are a MODEL capability, owned by the new `oscilla-scene-composites-d0d5` epic — NOT editor-ux substrate. Settled model shape: registered sub-patch templates expanded at compile-time into a flat `PillarPatch` (V1's flatness-preserving shape; hierarchical ScenePlan nodes rejected). User directive: composites are the honest implementation substrate for native blocks (a leaf block hiding a composition is a design error), so this is real work, not deferred-indefinitely. **Text-DSL is the canonical scene authoring surface** (`.4` in that epic); the **visual `CompositeEditor` panel + explode are user-deferred** future conveniences. V1 `CompositeEditor` + DSL-sidebar panels **delete at tranche 3** (scene composite authoring is text-first) — editor-ux substrate exit is **not** gated on the deferred visual editor. Surface owned, not dropped. [LAW:no-silent-failure] [LAW:one-source-of-truth] |
| 12 | CompilationInspector / IRTreeView / IRNodeDetail | `oscilla-scene-diagnostics-gjgg` | Inspects V1 `CompiledProgramIR`; the ScenePlan path needs a NEW inspector, not a port. One-era code gets no shared seam. [LAW:composability] |
| 15 | DemoBrowserSidebar | `oscilla-patch-dsl-463w` | Demo browsing is the native PillarPatch demo library, owned by the patch-dsl epic — not an editor chrome surface. |
| 16 | debug-viz (live value overlay) | `oscilla-scene-diagnostics-gjgg` | Live per-port value visualization is a diagnostics/observation concern on the pillar path. |
| — | diagnostic-console / log-panel | `oscilla-scene-diagnostics-gjgg` | V1 dock panels; diagnostics markers + console are owned elsewhere per the epic's "owned elsewhere" clause. (Not in the main parity inventory; recorded so no V1 panel is silently dropped.) |

### Wontfix

| # | Surface | Reason |
|---|---|---|
| 7b | DisplayNameEditor (per-block rename) | The `DisplayNameEditor` widget IS shared (rendered in `UnifiedNode`, both boots) — but pillar blocks are `canEditDisplayName:false`, so it shows a read-only name: there is no per-instance display name in the PillarPatch model, so a rename has nothing to write. Wontfix for EDITING (not a missing widget). Revisit only if the model grows per-instance names. [LAW:types-are-the-program] |
| — | `help` panel | Static help content, not an editor interaction; era-agnostic, no parity obligation. |

### Model-agnostic reuse gap (discovered by this audit)

| # | Surface | Disposition | Note |
|---|---|---|---|
| 13 | SettingsPanel | **remaining — `.25`** | `SettingsPanel` is **model-agnostic** app config (debug toggles, cardinality trace) — the epic's explicit "REUSE, don't rewrite" category. Today it is reachable ONLY in the V1 boot (right-sidebar tab); `SCENE_PANEL_MENU_ITEMS` omits it, so the scene shell exposes no Settings. Filed as `.25` to WIRE the existing `SettingsPanel` into the scene shell (reuse, not rebuild). [LAW:one-source-of-truth] |
| 17 | Node-position persistence | **remaining — `.26`** (`.14` residual) | The dockview LAYOUT persists per-era, but pillar graph node positions do not survive navigation (in-memory adapter map). Called out in row 1's caveat and the `.20` boot comment; filed as `.26` to give the scene era a position store (V1 uses `LayoutStore`). |

## Orphaned V1 code (delete candidates, surfaced by this audit)

These already have NO importers in `src` — the neutral seams (`.16`–`.23`) replaced them but the
files were left behind. They are safe to delete now (verify against the seam-gate tests, which
reference some as *forbidden imports*); listed here so tranche 3 removes them explicitly rather
than leaving dead residue. [LAW:carrying-cost]

- `src/ui/components/ConnectionPicker.tsx` — no importers.
- `src/ui/components/EdgeInspector.tsx`, `src/ui/components/InspectorContainer.tsx` — superseded by `SelectionDetailView`.
- `src/ui/components/LensParamControls.tsx` — lifted into `DecorationParamControls`; referenced only as a forbidden import in seam-gate tests.
- `src/ui/reactFlowEditor/ParameterControls.tsx` — already deleted in `.23`; confirm no re-introduction.

## Exit condition for the epic

Full exit (and legacy-delete tranche 3) is reached when every **remaining-ticketed** row above
is landed (`.4`, `.5`, `.7`, `.8`, `.10`, `.12`, `.25` SettingsPanel, `.26`
node-position) and every **superseded** row's owner epic has shipped its replacement —
**except row 11 (see below)** — at which point the V1 providers (`v1Era`, `v1LayoutPolicy`,
`V1BlockCatalog`, `V1SelectionDetail`, and the V1-only dock panels) can be deleted.

Row 11 (CompositeEditor) is the deliberate exception to that gate: its V1 panels delete at
tranche 3 **regardless of `oscilla-scene-composites-d0d5`'s schedule**, because scene composite
authoring is text-first and the visual editor is user-deferred — so there is no scene
CompositeEditor to wait for. The general rule does not gate on this row. Until then, `oscilla-editor-ux-8lsn.24` stays open
as the living accounting: **zero undispositioned rows today; not zero remaining rows.**
