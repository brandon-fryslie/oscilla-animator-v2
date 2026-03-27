# Attractor Layout Showcase
#
# A grid of dots warped by two orbiting attractors at different strengths.
# Three overlaid layers let you see the deformation in context:
#   - Blue base grid (undeformed reference)
#   - Teal soft attract (gentle pull toward orbiting target)
#   - Pink hard attract (strong collapse toward the same target)
#
# The attractor target orbits in a figure-eight (Lissajous) so the
# deformation sweeps across the grid in complex, non-circular patterns.
#
# Demonstrates: AttractorLayout strength comparison, animated Lissajous
#               target, multi-layer render, GridLayoutUV.

patch "Attractor Layout Showcase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 12000
    periodBMs = 8000
    role = "timeRoot"
    outputs {
      phaseA = target-orbit.refs
      phaseB = target-orbit.refs
    }
  }

  # Animated target: Lissajous figure-eight orbit.
  block "Expression" "target-orbit" {
    expression = <<-EXPR
      ax = clock.phaseA * 6.2832
      bx = clock.phaseB * 6.2832

      target_x = 0.5 + 0.25 * sin(ax)
      target_y = 0.5 + 0.18 * sin(bx * 2.0)

      vec2(target_x, target_y)
    EXPR
    outputs {
      out = [soft-attract.target, hard-attract.target]
    }
  }

  # Shared stamp shape — bigger dots for visibility.
  block "Ellipse" "dot" {
    rx = 0.009
    ry = 0.009
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 144
    outputs {
      elements = [grid.elements, base-color.elements, soft-color.elements, hard-color.elements]
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 12
    cols = 12
    outputs {
      controlPoints = base-render.controlPoints
      controlPoints = [soft-attract.points, hard-attract.points]
    }
  }

  # Soft attraction: subtle warping.
  block "AttractorLayout" "soft-attract" {
    strength = 0.3
    outputs {
      controlPoints = soft-render.controlPoints
    }
  }

  # Hard attraction: dramatic collapse.
  block "AttractorLayout" "hard-attract" {
    strength = 0.88
    outputs {
      controlPoints = hard-render.controlPoints
    }
  }

  # Color coding — distinct hues for each layer.
  block "FieldConstColor" "base-color" {
    r = 0.15
    g = 0.4
    b = 0.9
    a = 0.3
    outputs {
      color = base-render.color
    }
  }

  block "FieldConstColor" "soft-color" {
    r = 0.0
    g = 0.92
    b = 0.7
    a = 0.65
    outputs {
      color = soft-render.color
    }
  }

  block "FieldConstColor" "hard-color" {
    r = 1.0
    g = 0.25
    b = 0.7
    a = 0.9
    outputs {
      color = hard-render.color
    }
  }

  block "RenderInstances2D" "base-render" {}
  block "RenderInstances2D" "soft-render" {}
  block "RenderInstances2D" "hard-render" {}
}
