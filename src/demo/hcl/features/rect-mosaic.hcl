# Rect Mosaic
#
# A dense tiled wall of rectangles arranged in a grid, each with
# unique size variation and color.  Rippling scale waves and hue
# drift give the mosaic a living, breathing quality — like stained
# glass catching shifting light.
#
# Demonstrates: GridLayoutUV, Rect shape, NoisyBroadcast per-element
#               variation, Expression field scale, ShapeWobble2D.

patch "Rect Mosaic" {
  block "InfiniteTimeRoot" "time" {
    periodAMs = 10000
    periodBMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = [scale-expr.refs, tile-wobble.phase]
      phaseB = [scale-expr.refs, hue-shift.b]
    }
  }

  # --- Tile shape: rounded rectangles with subtle wobble ---

  block "Rect" "tile" {
    width = 0.032
    height = 0.032
    cornerRadius = 0.004
    outputs {
      controlPoints = tile-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "tile-wobble" {
    amount = 0.003
    frequency = 3
    outputs {
      points = tile-shape.controlPoints
    }
  }

  block "MakeShape2D" "tile-shape" {
    closed = true
    outputs {
      shape = instances.element
    }
  }

  # --- 256 tiles in a 16x16 grid ---

  block "Array" "instances" {
    count = 256
    outputs {
      elements = grid.elements
      t = [scale-expr.refs, hue-shift.a]
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 16
    cols = 16
    outputs {
      controlPoints = render.controlPoints
    }
  }

  # --- Scale: rippling waves across the grid ---

  block "Expression" "scale-expr" {
    expression = <<-EXPR
      lane = instances.t
      pa = mapField(time.phaseA * 6.2832, instances.t)
      pb = mapField(time.phaseB * 6.2832, instances.t)

      row = floor(lane * 16.0)
      col = fract(lane * 16.0) * 16.0

      wave1 = sin(row * 0.8 + pa * 1.5)
      wave2 = cos(col * 0.7 + pb * 1.2)
      ripple = 0.5 + 0.5 * wave1 * wave2

      0.4 + 0.8 * ripple
    EXPR
    outputs {
      out = render.scale
    }
  }

  # --- Per-element rainbow color with time drift ---

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.88
    l = 0.72
    a = 0.92
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
