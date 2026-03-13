# Spiral Garden
#
# Pentagons in an Archimedean spiral with animated rotation and pulsing scale.
# Per-element rainbow color.
# Demonstrates: ProceduralPolygon, SpiralLayout, ScaleBias pulsing, NoisyBroadcast.

patch "Spiral Garden" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 30000
    periodBMs = 3000
    role = "timeRoot"
    outputs {
      phaseA = spiral.phase
      phaseB = scale-osc.phase
    }
  }

  # --- Shape stamp: a pentagon ---

  block "ProceduralPolygon" "polygon" {
    sides = 5
    radiusX = 0.02
    radiusY = 0.02
    outputs {
      controlPoints = assemble.controlPoints
    }
  }

  block "MakeShape2D" "assemble" {
    closed = true
    outputs {
      shape = instances.element
    }
  }

  # --- Instance array ---

  block "Array" "instances" {
    count = 80
    outputs {
      elements = spiral.elements
      t = color.h
    }
  }

  # --- Spiral layout ---

  block "SpiralLayout" "spiral" {
    turns = 3
    expansion = 0.8
    outputs {
      controlPoints = render.controlPoints
    }
  }

  # --- Per-element rainbow color ---

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  # --- Pulsing scale ---

  block "Oscillator" "scale-osc" {
    outputs {
      out = scale-map.in
    }
  }

  block "Const" "scale-amt" {
    value = 0.15
    outputs {
      out = scale-map.scale
    }
  }

  block "Const" "scale-center" {
    value = 0.9
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
    value = 0.95
    outputs {
      out = scale-jitter.value
    }
  }

  block "Const" "jitter-seed" {
    value = 17
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
