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
      phaseA = [pulse.phase, tile-wobble.phase, hue-shift.b]
    }
  }

  block "Rect" "tile" {
    width = 0.016
    height = 0.010
    cornerRadius = 0.003
    outputs {
      controlPoints = tile-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "tile-wobble" {
    amount = 0.0023
    frequency = 5
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

  block "InstanceDomain" "instances" {
    count = 484
    outputs {
      index = grid.index
      rank = hue-shift.a
    }
  }

  block "ScatterUV" "grid" {

    outputs {
      uv = render.controlPoints
    }
  }

  # Pulsing scale: oscillator * 0.3 + 1.0 → [0.7, 1.3]
  block "Oscillator" "pulse" {
    outputs {
      out = scale-map.in
    }
  }

  block "Const" "scale-amt" {
    value = 0.4
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

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  # Per-element rainbow
  block "MakeColorOKLCH" "color" {
    s = 0.95
    l = 0.69
    a = 0.92
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
