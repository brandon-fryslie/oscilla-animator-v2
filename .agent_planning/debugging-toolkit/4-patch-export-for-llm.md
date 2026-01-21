Patch Export for LLM Context

  Goal: Export the current patch in a compact, LLM-readable format that captures all the information needed to understand and debug it.

  ---
  Patch Export for LLM - Planning Prompt

  Goal: Create a one-click export that produces a concise, structured representation of the current patch suitable for pasting into an LLM
  conversation.

  Core Requirements

  1. Trigger: Button in toolbar or keyboard shortcut (Ctrl+Shift+E), also available via /export-patch command
  2. Output: Markdown-formatted text copied to clipboard
  3. Concise: Omit default values, use shorthand notation
  4. Complete: Include everything needed to reproduce the patch
  5. Layered: Summary first, then details (LLM can stop reading when it has enough)

  Output Format

  ## Patch: [patch name or "Untitled"]

  ### Blocks (5)
  | ID | Type | Config |
  |----|------|--------|
  | b1 | Array | count=5000 |
  | b2 | CircleLayout | radius=0.4 |
  | b3 | ProceduralPolygon | sides=5, radiusX=0.1, radiusY=0.1 |
  | b4 | HSVColor | h=index*0.1, s=0.8, v=1.0 |
  | b5 | Render | |

  ### Connections (4)
  b1.instances → b2.instances
  b2.positions → b5.pos
  b3.shape → b5.shape
  b4.color → b5.color

  ### Block Details (non-default inputs only)

  **b1 (Array)**
  - count: 5000 (default: 100)

  **b3 (ProceduralPolygon)**
  - sides: 5 (default: 5)
  - radiusX: 0.1 (default: 0.1)
  - radiusY: 0.1 (default: 0.1)

  ### Compile Status
  ✓ Compiled successfully
  - Instances: 2 (Array:5000, Polygon:5)
  - Render targets: 1
  - Steps: 12

  ### Runtime Status (optional, if erroring)
  ❌ Error: "Path topology 'polygon-5' requires control points buffer"
    at Canvas2DRenderer.ts:108

  Architecture

  ┌─────────────────────────────────────────────────────┐
  │ PatchExporter                                       │
  │ - exportToMarkdown(patch, options) → string         │
  │ - exportToJSON(patch) → object (for reimport)       │
  │ - includeCompileInfo: boolean                       │
  │ - includeRuntimeStatus: boolean                     │
  │ - verbosity: 'minimal' | 'normal' | 'verbose'       │
  └─────────────────────────────────────────────────────┘

  Files to Create

  - src/ui/debug/PatchExporter.ts - Core export logic
  - src/ui/debug/exportFormats.ts - Format helpers (markdown, JSON, shorthand)

  Shorthand Notation

  # Instead of verbose JSON:
  { "id": "b1", "type": "Array", "inputs": { "count": { "value": 5000 } } }

  # Use compact notation:
  b1:Array(count=5000)

  # Connections as arrows:
  b1.out → b2.in

  # Expressions inline:
  h=index*0.1

  Options

  interface ExportOptions {
    verbosity: 'minimal' | 'normal' | 'verbose';
    includeDefaults: boolean;      // Show values even if default
    includeCompileInfo: boolean;   // Add compilation summary
    includeRuntimeError: boolean;  // Add current error if any
    includeIR: boolean;            // Add relevant IR snippets (verbose only)
    format: 'markdown' | 'json' | 'shorthand';
  }

  Integration

  - Add "Export for Debug" button to toolbar
  - Add /export-patch slash command
  - Auto-include in error reports
  - Option to include with bug reports

  Example Minimal Output

  Patch: 5 blocks, 4 edges
  b1:Array(5000) → b2:CircleLayout → b5:Render
  b3:ProceduralPolygon(5) → b5.shape
  b4:HSVColor → b5.color
  Status: ✓ compiled | ❌ runtime error: "Path topology requires control points"

  ---
  This gives you a quick way to share patch state. Combined with the other inspectors, you'd have full visibility: what the patch looks like (export)
   → what IR was generated (compilation inspector) → what's happening at runtime (runtime inspector) → what's flowing through edges (debug probe).