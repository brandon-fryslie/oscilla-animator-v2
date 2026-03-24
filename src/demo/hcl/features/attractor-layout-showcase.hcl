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
    expression = <<-EXPR
      // Orbit center in normalized viewport coordinates.
      // Visual: keeps attractor movement centered in the patch.
      center_x = 0.5
      center_y = 0.5

      // Radius of the target orbit.
      // Visual: controls how far the deformation focus travels.
      radius = 0.22

      // Clock phase in radians.
      // Visual: drives smooth circular target motion over time.
      angle = clock.phaseA * 6.2832

      // Circular offset from center.
      // Visual: traces the moving deformation hotspot.
      target_x = center_x + radius * cos(angle)
      target_y = center_y + radius * sin(angle)

      // Emit animated attractor target.
      // Visual: both soft/hard attractors chase this moving point.
      vec2(target_x, target_y)
    EXPR
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
  block "InstanceDomain" "instances" {
    count = 196
    outputs {
      index = [grid.index, base-color.index, soft-color.index, hard-color.index]
    }
  }

  # Baseline spatial distribution.
  block "ScatterUV" "grid" {

    outputs {
      uv = base-render.controlPoints
      uv = [soft-attract.points, hard-attract.points]
    }
  }

  # Same input points, weaker attraction.
  block "AttractorLayout" "soft-attract" {
    strength = 0.25
    outputs {
      controlPoints = soft-render.controlPoints
    }
  }

  # Same input points, stronger attraction.
  block "AttractorLayout" "hard-attract" {
    strength = 0.85
    outputs {
      controlPoints = hard-render.controlPoints
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
