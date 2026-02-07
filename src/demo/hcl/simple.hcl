# Simple
#
# 4 circles in a rotating circle layout with per-element rainbow that shifts over time.
# Minimum viable patch demonstrating core concepts.
# Demonstrates: InfiniteTimeRoot, Array, CircleLayoutUV, per-element color animation.

patch "Simple" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    periodBMs = 12000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
      phaseB = hue-add.b
    }
  }

  block "Ellipse" "dot" {
    rx = 0.04
    ry = 0.04
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 4
    outputs {
      elements = layout.elements
      t = hue-add.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.2
    outputs {
      position = render.pos
    }
  }

  # Per-element rainbow: hue = normalizedIndex + time
  block "Add" "hue-add" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {
    inputs {
      color = color.color
      pos = layout.position
    }
  }
}
