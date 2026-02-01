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
  }

  block "Array" "grid-elements" {
    count = 625
  }

  block "GridLayoutUV" "grid" {
    rows = 25
    cols = 25
  }

  # Neon green
  block "Const" "color" {
    value = { r = 0.2, g = 1, b = 0.4, a = 0.9 }
  }

  block "RenderInstances2D" "render" {}

  connect {
    from = tile.shape
    to = grid-elements.element
  }

  connect {
    from = grid-elements.elements
    to = grid.elements
  }

  connect {
    from = grid.position
    to = render.pos
  }

  connect {
    from = color.out
    to = render.color
  }

  connect {
    from = tile.shape
    to = render.shape
  }
}
