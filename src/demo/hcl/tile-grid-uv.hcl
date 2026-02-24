# Tile Grid UV
#
# 20x20 grid with per-element rainbow and pulsing per-tile jitter.
# Demonstrates: GridLayoutUV, oscillator scale, NoisyBroadcast variation.

patch "Tile Grid UV" {
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
    frequency = 6
    elementVariation = 1.1
    seed = 41
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
      scale = [aniso-apply-x.b, aniso-apply-y.b]
    }
  }

  block "Const" "saturation" {
    value = 0.8
    outputs {
      out = color.s
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  # Pulsing scale
  block "Oscillator" "pulse" {
    outputs {
      out = [scale-map.in, rotation-jitter.value, cp-phase-add.b]
    }
  }

  block "Const" "scale-amt" {
    value = 0.25
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
    value = 37
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
    value = 0.42
    outputs {
      out = rotation-jitter.amount
    }
  }

  block "Const" "rot-seed" {
    value = 109
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

  # Per-instance anisotropic deformation channels.
  block "Const" "aniso-amt-x" {
    value = 0.11
    outputs {
      out = aniso-x.amount
    }
  }

  block "Const" "aniso-amt-y" {
    value = 0.07
    outputs {
      out = aniso-y.amount
    }
  }

  block "Const" "aniso-seed-x" {
    value = 307
    outputs {
      out = aniso-x.seed
    }
  }

  block "Const" "aniso-seed-y" {
    value = 509
    outputs {
      out = aniso-y.seed
    }
  }

  block "NoisyBroadcast" "aniso-x" {
    outputs {
      out = aniso-apply-x.a
    }
  }

  block "NoisyBroadcast" "aniso-y" {
    outputs {
      out = aniso-apply-y.a
    }
  }

  block "Multiply" "aniso-apply-x" {
    outputs {
      out = scale2-pack.x
    }
  }

  block "Multiply" "aniso-apply-y" {
    outputs {
      out = scale2-pack.y
    }
  }

  block "Construct" "scale2-pack" {
    outputs {
      vec2 = render.scale2
    }
  }

  # Per-element control-point deformation channels.
  block "Add" "cp-phase-add" {
    outputs {
      out = render.deformPhase
    }
  }

  block "Const" "cp-amount-base" {
    value = 0.0013
    outputs {
      out = cp-amount.value
    }
  }

  block "Const" "cp-amount-var" {
    value = 0.001
    outputs {
      out = cp-amount.amount
    }
  }

  block "Const" "cp-amount-seed" {
    value = 619
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
    value = 5
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

  # Base value for anisotropic deformation channels.
  block "Const" "aniso-base" {
    value = 1.0
    outputs {
      out = [aniso-x.value, aniso-y.value]
    }
  }

  block "RenderInstances2D" "render" {}
}
