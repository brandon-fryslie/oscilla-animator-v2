Compilation Pipeline Inspector

  Goal: Visualize the data flow through compilation passes to see exactly what IR is generated at each stage.

  ---
  Compilation Pipeline Inspector - Planning Prompt

  Goal: Create a Compilation Inspector that shows what each compiler pass produces, making it easy to trace where data gets lost or transformed
  incorrectly.

  Core Requirements

  1. Trigger: Button in Debug Panel or keyboard shortcut (Ctrl+Shift+C)
  2. Display: Collapsible tree view showing each pass's output
  3. Passes to inspect:
    - Pass 1-5: Normalization, typing, time resolution, validation, cycle check
    - Pass 6: Block lowering (show IR nodes, instances, field expressions)
    - Pass 7: Schedule (show steps, render targets, materialization slots)
  4. Drill-down: Click any IR node to see full details
  5. Search: Find specific block IDs, slot IDs, instance IDs

  Key Questions This Answers

  - "Did the block output the right SigExprShapeRef?"
  - "Does the shapeRef have controlPointField set?"
  - "Is the render step including controlPoints slot?"
  - "What instance is being used for this render target?"

  Architecture

  ┌─────────────────────────────────────────────────────┐
  │ CompilationInspectorService                         │
  │ - capturePassOutput(passName, data)                 │
  │ - getPassOutput(passName) → PassSnapshot            │
  │ - onCompile → capture all passes                    │
  └─────────────────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────┐
  │ <CompilationInspector> panel                        │
  │ - Pass selector (dropdown/tabs)                     │
  │ - Tree view of IR structures                        │
  │ - JSON view toggle for raw data                     │
  │ - Search/filter bar                                 │
  └─────────────────────────────────────────────────────┘

  Files to Create

  - src/ui/debug/CompilationInspectorService.ts
  - src/ui/debug/CompilationInspector.tsx
  - src/ui/debug/IRTreeView.tsx - Recursive tree renderer
  - src/ui/debug/IRNodeDetail.tsx - Detail view for selected node

  Data to Capture Per Pass

  interface PassSnapshot {
    passName: string;
    timestamp: number;
    duration: number;
    input: unknown;  // Previous pass output
    output: unknown; // This pass output
    errors: CompileError[];
  }

  Integration

  Wrap each pass in compile.ts with capture calls. Add panel to Dockview layout.