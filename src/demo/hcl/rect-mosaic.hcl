# Rect Mosaic
#
# 400 rectangles in a rotating circle layout with pulsing scale
# and per-element green-to-teal gradient that shifts over time.
# Demonstrates: Expression block with collect refs, pulsing scale animation.

patch "Rect Mosaic" {
  block "InfiniteTimeRoot" "time" {
    periodAMs = 4000
    periodBMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
      phaseB = hue-animated.b
    }
  }

  block "Rect" "tile" {
    width = 0.03
    height = 0.015
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 400
    outputs {
      elements = layout.elements
      t = hue-scaled.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.45
    outputs {
      position = render.pos
    }
  }

  # Per-element green-to-teal (hue 0.25→0.5), shifting with time
  block "Const" "hue-range" {
    value = 0.25
    outputs {
      out = hue-scaled.b
    }
  }

  block "Multiply" "hue-scaled" {
    outputs {
      out = hue-offset.a
    }
  }

  block "Add" "hue-offset" {
    outputs {
      out = hue-animated.a
    }
  }

  block "Add" "hue-animated" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  # Pulsing scale using Expression with collect edge reference
  # block "Expression" "scale-expr" {
    # expression = "1.0 + 0.5 * sin(phase * 6.28 + 1.57)"
    # expression = "1.0"
    # collect edges from time.phaseA → refs (alias "phase")
    # outputs {
    #   out = render.scale
    # }
  # }

  block "RenderInstances2D" "render" {}
}
