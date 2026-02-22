# Tile Grid
#
# 20x20 grid of rectangles with per-element rainbow and pulsing
# per-tile scale jitter.
# Demonstrates: GridLayoutUV, Rect shape, ScaleBias, NoisyBroadcast.

patch "Tile Grid" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    role = "timeRoot"
    outputs {
      phaseA = [pulse.phase, tile-wobble.phase]
    }
  }

  block "Rect" "tile" {
    width = 0.018
    height = 0.012
    outputs {
      controlPoints = tile-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "tile-wobble" {
    amount = 0.0018
    frequency = 5
    outputs {
      points = tile-shape.controlPoints
    }
  }

  block "MakeShape2D" "tile-shape" {
    closed = 1
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 400
    outputs {
      elements = grid.elements
      t = color.h
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 20
    cols = 20
    outputs {
      position = render.pos
    }
  }

  # Pulsing scale: oscillator * 0.3 + 1.0 → [0.7, 1.3]
  block "Oscillator" "pulse" {
    outputs {
      out = scale-map.in
    }
  }

  block "Const" "scale-amt" {
    value = 0.3
    outputs {
      out = scale-map.scale
    }
  }

  block "Const" "scale-center" {
    value = 1.0
    outputs {
      out = scale-map.bias
    }
  }

  block "ScaleBias" "scale-map" {
    outputs {
      out = scale-jitter.amount
    }
  }

  block "Const" "base-scale" {
    value = 1.0
    outputs {
      out = scale-jitter.value
    }
  }

  block "Const" "jitter-seed" {
    value = 23
    outputs {
      out = scale-jitter.seed
    }
  }

  block "NoisyBroadcast" "scale-jitter" {
    outputs {
      out = render.scale
    }
  }

  # Per-element rainbow
  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
