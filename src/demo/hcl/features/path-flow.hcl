# Path Flow
#
# Demonstrates the v2.5 layout system:
#   - PathLayout (Type B Relation): distributes elements along an arc-length
#     parameterized path defined by a ProceduralPolygon
#   - Expression recentering: lifts origin-authored path samples into viewport UV space
#   - Animated offset: elements flow continuously around the pentagon path
#
# ═══════════════════════════════════════════════════════════════════════════
# EXPECTED BEHAVIOR
# ═══════════════════════════════════════════════════════════════════════════
#
# Visual:
#   - 40 glowing ellipses arranged in a pentagonal path around the center
#     of the viewport
#   - Each ellipse has a unique hue from the rainbow spectrum (red → orange
#     → yellow → green → cyan → blue → violet), cycling across the 40
#     elements based on their normalized index
#   - Elements are evenly distributed along the pentagon's perimeter via
#     arc-length parameterized sampling — straight edges get fewer dots
#     than they would with naive angle-based distribution (only true if
#     edges have different lengths; for a regular pentagon they're equal)
#
# Animation:
#   - The 40 dots flow continuously around the pentagonal path, completing
#     one full circuit every 8 seconds (periodAMs = 8000)
#   - The flow is driven by PathLayout's offset input, which receives a
#     0→1 ramp from InfiniteTimeRoot.phaseA. The wrap01 contract ensures
#     smooth wrapping at the boundary (no discontinuity when offset
#     crosses from ~1.0 back to ~0.0)
#   - The rainbow colors move WITH the elements (each element keeps its
#     hue as it travels), creating a flowing rainbow necklace effect
#
# Positioning math:
#   - ProceduralPolygon generates 5 vertices centered at (0, 0) with
#     radius 0.2, so vertices lie at distance 0.2 from origin
#   - PathLayout samples M=40 positions along these 5 edges
#   - Expression adds (0.5, 0.5) to each sampled point
#   - Result: control points are roughly in the range (0.3, 0.3) to (0.7, 0.7),
#     centered in the viewport instead of clustering in the upper-left quadrant
#
# Blocks exercised:
#   PathLayout       — arc-length path sampling via pathSample kernel
#   ProceduralPolygon — pentagon path source (shapeRef + controlPoints)
#   MakeShape2D      — topology assembler (consumes controlPoints)
#   Expression       — field swizzle + viewport recentering
#
# ═══════════════════════════════════════════════════════════════════════════

patch "Path Flow" {

  # --- Time source: 8-second cycle for flow animation ---

  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    role = "timeRoot"
  }

  # --- Pentagon path definition ---
  # ProceduralPolygon creates:
  #   shape         → One<shape2d> (shapeRef with topology + controlPointField)
  #   controlPoints → Field<vec2> over control instance (5 vertices)

  block "ProceduralPolygon" "polygon" {
    sides = 5
    radiusX = 0.2
    radiusY = 0.2
    outputs {
      controlPoints = path-layout.controlPoints
    }
  }

  # --- Visual stamp: small ellipses for each instance ---

  block "Ellipse" "dot" {
    rx = 0.011
    ry = 0.011
    outputs {
      shape = arr.element
    }
  }

  # --- Instance array: 40 elements ---

  block "InstanceDomain" "arr" {
    count = 40
    outputs {
      rank = [path-layout.t, color.h]
    }
  }

  # --- PathLayout: distribute along pentagon path ---
  # spacing=1 (default) → elements span exactly one path length
  # offset ← animated 0→1 ramp from clock → continuous flow

  block "SamplePath" "path-layout" {
    outputs {
      position = center-path.refs
    }
  }

  block "Expression" "center-path" {
    expression = <<-EXPR
      // PathLayout samples the pentagon in origin space.
      // Visual: offset the flowing necklace into centered UV space without collapsing its radius.
      x = path_layout.position.x + 0.5
      y = path_layout.position.y + 0.5
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  # --- Per-element rainbow color from normalized index ---

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
