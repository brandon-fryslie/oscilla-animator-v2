# Golden Spiral
#
# 5000 ellipses in a slowly rotating circle layout.
# Static rainbow gradient across all elements — each element a unique hue.
# Demonstrates: large instance counts, per-element hue gradient, slow animation.

patch "Golden Spiral" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 30000
    periodBMs = 120000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
    }
  }

  block "Ellipse" "dot" {
    rx = 0.02
    ry = 0.02
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 5000
    outputs {
      elements = layout.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.35
    outputs {
      position = render.pos
    }
  }

  # Per-element hue: each element gets its own slice of the spectrum
  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
