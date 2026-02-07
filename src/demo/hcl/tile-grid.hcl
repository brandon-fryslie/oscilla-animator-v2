# Tile Grid
#
# 20x20 grid of rectangles. Each tile gets a unique hue from the spectrum,
# slowly cycling over time.
# Demonstrates: GridLayoutUV, Rect shape, per-element hue cycling.

patch "Tile Grid" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    periodBMs = 15000
    role = "timeRoot"
    outputs {
      phaseA = hue-add.b
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
      t = hue-add.a
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 20
    cols = 20
    outputs {
      position = render.pos
    }
  }

  # Per-element cycling hue
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

  block "RenderInstances2D" "render" {}
}
