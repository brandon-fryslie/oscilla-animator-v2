# Breathing Ring
#
# A ring of circles that pulses in size with per-element rainbow and
# per-instance jitter. The oscillator drives jitter amount through ScaleBias.
# Demonstrates: ScaleBias, NoisyBroadcast, per-element rainbow.

patch "Breathing Ring" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2000
    role = "timeRoot"
    outputs {
      phaseA = [breath.phase, dot-wobble.phase]
    }
  }

  # Shape and instances
  block "Ellipse" "dot" {
    rx = 0.03
    ry = 0.03
    outputs {
      controlPoints = dot-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "dot-wobble" {
    amount = 0.003
    frequency = 8
    outputs {
      points = dot-shape.controlPoints
    }
  }

  block "MakeShape2D" "dot-shape" {
    closed = true
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 20
    outputs {
      elements = ring.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.3
    outputs {
      position = render.pos
    }
  }

  # Breathing animation: scale = oscillator * 0.5 + 1.0 → [0.5, 1.5]
  block "Oscillator" "breath" {
    outputs {
      out = scale-map.in
    }
  }

  block "Const" "scale-amt" {
    value = 0.5
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
    value = 7
    outputs {
      out = scale-jitter.seed
    }
  }

  block "NoisyBroadcast" "scale-jitter" {
    outputs {
      out = render.scale
    }
  }

  # Per-element rainbow: each dot gets its own hue from Array.t
  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
