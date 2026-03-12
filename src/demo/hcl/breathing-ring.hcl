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
      controlPoints = render.controlPoints
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
  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}

  # spice_overlay_v2: radial accent layer
  block "Rect" "spicea_tile" {
    width = 0.009
    height = 0.009
    cornerRadius = 0.002
    outputs {
      shape = spicea_instances.element
    }
  }

  block "Array" "spicea_instances" {
    count = 36
    outputs {
      elements = spicea_layout.elements
      t = [spicea_offset.refs, spicea_color.h]
    }
  }

  block "CircleLayoutUV" "spicea_layout" {
    radius = 0.44
    outputs {
      controlPoints = spicea_offset.refs
    }
  }

  block "Expression" "spicea_offset" {
    expression = <<-EXPR
      lane = spicea_instances.t * 31.4159
      x = spicea_layout.controlPoints.x + 0.018 * sin(lane)
      y = spicea_layout.controlPoints.y + 0.018 * cos(lane * 1.3)
      vec2(x, y)
    EXPR
    outputs {
      out = spicea_render.controlPoints
    }
  }

  block "Const" "spicea_scale" {
    value = 0.38
    outputs {
      out = spicea_render.scale
    }
  }

  block "Const" "spicea_sat" {
    value = 0.84
    outputs {
      out = spicea_color.s
    }
  }

  block "Const" "spicea_light" {
    value = 0.72
    outputs {
      out = spicea_color.l
    }
  }

  block "Const" "spicea_alpha" {
    value = 0.7
    outputs {
      out = spicea_color.a
    }
  }

  block "MakeColorOKLCH" "spicea_color" {
    outputs {
      color = spicea_render.color
    }
  }

  block "RenderInstances2D" "spicea_render" {}

}
