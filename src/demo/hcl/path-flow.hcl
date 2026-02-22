# Path Flow
#
# Demonstrates the v2.5 layout system:
#   - PathLayout (Type B Relation): distributes elements along an arc-length
#     parameterized path defined by a ProceduralPolygon
#   - AttractorLayout (Type C Deformer): pulls distributed control points toward
#     a target point, centering them in the viewport
#   - Animated offset: elements flow continuously around the pentagon path
#
# ═══════════════════════════════════════════════════════════════════════════
# EXPECTED BEHAVIOR
# ═══════════════════════════════════════════════════════════════════════════
#
# Visual:
#   - 40 small ellipses arranged in a pentagonal pattern near the center
#     of the viewport
#   - The pentagon is "softened" (pulled inward) because AttractorLayout
#     lerps each control point 60% toward the center point (0.5, 0.5)
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
#   - AttractorLayout with strength=0.6 lerps: output = 0.4*path + 0.6*target
#     where target defaults to (0.5, 0.5)
#   - Result: control points are roughly in the range (0.2, 0.15) to (0.4, 0.38),
#     visible in the center-left area of the viewport
#
# Blocks exercised:
#   PathLayout       — arc-length path sampling via pathSample kernel
#   AttractorLayout  — component-wise control-point lerp deformer
#   ProceduralPolygon — pentagon path source (shapeRef + controlPoints)
#   MakeShape2D      — topology assembler (consumes controlPoints)
#
# ═══════════════════════════════════════════════════════════════════════════

patch "Path Flow" {

  # --- Time source: 8-second cycle for flow animation ---

  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    role = "timeRoot"
    outputs {
      phaseA = [pathLayout.offset, polygon-wobble.phase]
    }
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
      controlPoints = polygon-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "polygon-wobble" {
    amount = 0.02
    frequency = 5
    outputs {
      points = assembler.controlPoints
    }
  }

  block "MakeShape2D" "assembler" {
    closed = 1
    outputs {
      shape = pathLayout.shape
    }
  }

  # --- Visual stamp: small ellipses for each instance ---

  block "Ellipse" "dot" {
    rx = 0.008
    ry = 0.008
    outputs {
      shape = arr.element
    }
  }

  # --- Instance array: 40 elements ---

  block "Array" "arr" {
    count = 40
    outputs {
      elements = pathLayout.elements
      t = color.h
    }
  }

  # --- PathLayout: distribute along pentagon path ---
  # spacing=1 (default) → elements span exactly one path length
  # offset ← animated 0→1 ramp from clock → continuous flow

  block "PathLayout" "pathLayout" {
    outputs {
      controlPoints = attractor.points
    }
  }

  # --- AttractorLayout: pull control points toward viewport center ---
  # target defaults to (0.5, 0.5), strength=0.6 → gentle centering

  block "AttractorLayout" "attractor" {
    strength = 0.6
    outputs {
      position = render.pos
    }
  }

  # --- Per-element rainbow color from normalized index ---

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
