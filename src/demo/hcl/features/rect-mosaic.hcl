# Rect Mosaic
#
# 400 rectangles in a rotating circle layout with pulsing scale
# via Oscillator → ScaleBias and per-instance jitter.
# Demonstrates: ScaleBias pulsing, NoisyBroadcast, per-element rainbow.

patch "Rect Mosaic" {
  block "InfiniteTimeRoot" "time" {
    periodAMs = 4000
    periodBMs = 3000
    role = "timeRoot"
    outputs {
      phaseA = [ pulse.phase, tile-wobble.phase]
    }
  }

  block "Rect" "tile" {
    width = 0.03
    height = 0.015
    outputs {
      controlPoints = tile-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "tile-wobble" {
    amount = 0.0025
    frequency = 4
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
    count = 400
    outputs {
      index = layout.index
      rank = color.h
    }
  }

  block "ScatterUV" "layout" {
    outputs {
      uv = render.controlPoints
    }
  }

  # Per-element rainbow
  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  # Pulsing scale: Oscillator → ScaleBias(0.5, 1.0) → [0.5, 1.5]
  block "Oscillator" "pulse" {
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
    value = 41
    outputs {
      out = scale-jitter.seed
    }
  }

  block "NoisyBroadcast" "scale-jitter" {
    outputs {
      out = render.scale
    }
  }

  block "RenderInstances2D" "render" {}
}
