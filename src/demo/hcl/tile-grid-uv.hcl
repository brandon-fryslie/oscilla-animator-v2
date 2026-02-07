# Tile Grid UV
#
# Same as Tile Grid but with per-element desaturated blue-to-cyan gradient.
# Demonstrates: GridLayoutUV, constrained hue range, saturation control.

patch "Tile Grid UV" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    periodBMs = 10000
    role = "timeRoot"
    outputs {
      phaseB = hue-animated.b
    }
  }

  block "Rect" "tile" {
    width = 0.018
    height = 0.012
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 400
    outputs {
      elements = grid.elements
      t = hue-scaled.a
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 20
    cols = 20
    outputs {
      position = render.pos
    }
  }

  # Per-element hue in the blue-cyan range (0.5–0.75), shifting with time
  # Multiply t by 0.25 to compress the hue range, then add 0.5 base + time offset
  block "Const" "hue-range" {
    value = 0.25
    outputs {
      out = hue-scaled.b
    }
  }

  block "Const" "hue-base" {
    value = 0.5
    outputs {
      out = hue-offset.b
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

  block "Const" "saturation" {
    value = 0.6
    outputs {
      out = color.s
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
