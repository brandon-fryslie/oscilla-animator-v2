# Attractor Layout Showcase
#
# Purpose:
#   Demonstrate AttractorLayout's specific behavior as a control-point deformer.
#
# What this patch shows:
#   1) Base layout points (blue): raw GridLayoutUV positions
#   2) Soft attract (teal): same points lerped toward center with strength=0.25
#   3) Hard attract (pink): same points lerped toward center with strength=0.85
#   4) Animated target (orbiting vec2), so deformation is visibly dynamic
#
# Expected result:
#   - Three overlaid point clouds using identical instance IDs and shapes
#   - Soft set remains close to base layout
#   - Hard set collapses strongly toward the center
#   - Both attracted sets continuously move as the target orbits
#   - This demonstrates AttractorLayout's per-point lerp semantics:
#       out = lerp(points, target, strength)

patch "Attractor Layout Showcase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 16000
    role = "timeRoot"
    outputs {
      phaseA = target-orbit.refs
    }
  }

  # Animated target: orbit around viewport center.
  block "Expression" "target-orbit" {
    expression = "vec2(0.5 + 0.22 * cos(clock.phaseA * 6.2832), 0.5 + 0.22 * sin(clock.phaseA * 6.2832))"
    outputs {
      out = [soft-attract.target, hard-attract.target]
    }
  }

  # Shared stamp shape for all three overlays.
  block "Ellipse" "dot" {
    rx = 0.005
    ry = 0.005
    outputs {
      shape = instances.element
    }
  }

  # One instance set drives all branches so only layout math differs.
  block "Array" "instances" {
    count = 196
    outputs {
      elements = [grid.elements, base-color.elements, soft-color.elements, hard-color.elements]
    }
  }

  # Baseline spatial distribution.
  block "GridLayoutUV" "grid" {
    rows = 14
    cols = 14
    outputs {
      position = base-render.pos
      controlPoints = [soft-attract.points, hard-attract.points]
    }
  }

  # Same input points, weaker attraction.
  block "AttractorLayout" "soft-attract" {
    strength = 0.25
    outputs {
      position = soft-render.pos
    }
  }

  # Same input points, stronger attraction.
  block "AttractorLayout" "hard-attract" {
    strength = 0.85
    outputs {
      position = hard-render.pos
    }
  }

  # Color coding by branch.
  block "FieldConstColor" "base-color" {
    r = 0.12
    g = 0.46
    b = 1.0
    a = 0.45
    outputs {
      color = base-render.color
    }
  }

  block "FieldConstColor" "soft-color" {
    r = 0.0
    g = 0.95
    b = 0.72
    a = 0.55
    outputs {
      color = soft-render.color
    }
  }

  block "FieldConstColor" "hard-color" {
    r = 1.0
    g = 0.3
    b = 0.75
    a = 0.8
    outputs {
      color = hard-render.color
    }
  }

  block "RenderInstances2D" "base-render" {}
  block "RenderInstances2D" "soft-render" {}
  block "RenderInstances2D" "hard-render" {}
}
