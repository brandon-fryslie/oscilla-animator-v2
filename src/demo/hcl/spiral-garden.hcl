# Spiral Garden
#
# Pentagons in an Archimedean spiral with animated rotation and pulsing scale.
# Per-element rainbow color.
# Demonstrates: ProceduralPolygon, SpiralLayout, ScaleBias pulsing.

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
    closed = 1
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
      position = render.pos
    }
  }

  # --- Per-element rainbow color ---

  block "MakeColorHSL" "color" {
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
      out = render.scale
    }
  }

  block "RenderInstances2D" "render" {}
}
