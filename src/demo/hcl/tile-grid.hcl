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
    elementVariation = 0.9
    seed = 17
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

  block "Array" "instances" {
    count = 400
    outputs {
      elements = grid.elements
      t = [color.h, cp-phase-add.a, cp-freq-map.in, render.deformSeed]
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 20
    cols = 20
    outputs {
      position = render.pos
      rotation = rotation-add.a
    }
  }

  # Pulsing scale: oscillator * 0.3 + 1.0 → [0.7, 1.3]
  block "Oscillator" "pulse" {
    outputs {
      out = [scale-map.in, rotation-jitter.value, cp-phase-add.b]
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

  # Per-instance rotational deformation: base layout rotation + jitter field.
  block "Const" "rot-amount" {
    value = 0.35
    outputs {
      out = rotation-jitter.amount
    }
  }

  block "Const" "rot-seed" {
    value = 71
    outputs {
      out = rotation-jitter.seed
    }
  }

  block "NoisyBroadcast" "rotation-jitter" {
    outputs {
      out = rotation-add.b
    }
  }

  block "Add" "rotation-add" {
    outputs {
      out = render.rotation
    }
  }

  # Per-element control-point deformation channels.
  block "Add" "cp-phase-add" {
    outputs {
      out = render.deformPhase
    }
  }

  block "Const" "cp-amount-base" {
    value = 0.0012
    outputs {
      out = cp-amount.value
    }
  }

  block "Const" "cp-amount-var" {
    value = 0.0009
    outputs {
      out = cp-amount.amount
    }
  }

  block "Const" "cp-amount-seed" {
    value = 313
    outputs {
      out = cp-amount.seed
    }
  }

  block "NoisyBroadcast" "cp-amount" {
    outputs {
      out = render.deformAmount
    }
  }

  block "Const" "cp-freq-scale" {
    value = 4
    outputs {
      out = cp-freq-map.scale
    }
  }

  block "Const" "cp-freq-bias" {
    value = 2
    outputs {
      out = cp-freq-map.bias
    }
  }

  block "ScaleBias" "cp-freq-map" {
    outputs {
      out = render.deformFrequency
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
