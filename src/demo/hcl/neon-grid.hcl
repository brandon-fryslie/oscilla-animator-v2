# Neon Grid
#
# 625 tiny rectangles in a 25x25 grid.
# Demonstrates: GridLayoutUV, Rect shape, large instance counts.

patch "Neon Grid" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5000
    periodBMs = 20000
    role = "timeRoot"
  }

  block "Rect" "tile" {
    width = 0.012
    height = 0.012
    cornerRadius = 0.002
    outputs {
      shape = [grid-elements.element, render.shape]
    }
  }

  block "Array" "grid-elements" {
    count = 625
    outputs {
      elements = grid.elements
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 25
    cols = 25
    outputs {
      position = render.pos
    }
  }

  # Neon green
  block "Const" "color" {
    value = { r = 0.2, g = 1, b = 0.4, a = 0.9 }
    outputs {
      out = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
