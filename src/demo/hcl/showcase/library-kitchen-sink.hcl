# Library Kitchen Sink
#
# A deliberately visual sampler instead of a block-counting exercise:
# - a pulsing neon tile halo
# - a dense inner spiral of glowing dots
# - a flowing polygon necklace threading through the center
#
# The goal is to show the library can make an attractive composition quickly,
# not to touch every block in the app.

patch "Library Kitchen Sink" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 12000
    periodBMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = [
        halo-pulse.phase,
        halo-wobble.phase,
        spiral-pulse.phase,
        spiral-wobble.phase]
      phaseB = [
        halo-hue-shift.b,
        spiral-hue-shift.b,
        path-hue-shift.b]
    }
  }

  # --- Halo branch: neon tile ring ---

  block "Rect" "halo-tile" {
    width = 0.024
    height = 0.008
    cornerRadius = 0.002
    outputs {
      controlPoints = halo-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "halo-wobble" {
    amount = 0.002
    frequency = 6
    outputs {
      points = halo-shape.controlPoints
    }
  }

  block "MakeShape2D" "halo-shape" {
    closed = true
    outputs {
      shape = halo-array.element
    }
  }

  block "InstanceDomain" "halo-array" {
    count = 220
    outputs {
      index = halo-layout.index
      rank = halo-hue-shift.a
    }
  }

  block "ScatterUV" "halo-layout" {
    outputs {
      uv = halo-render.controlPoints
    }
  }

  block "Add" "halo-hue-shift" {
    outputs {
      out = halo-color.h
    }
  }

  block "MakeColorOKLCH" "halo-color" {
    s = 0.98
    l = 0.72
    outputs {
      color = halo-render.color
    }
  }

  block "Oscillator" "halo-pulse" {
    outputs {
      out = halo-scale-map.in
    }
  }

  block "Const" "halo-scale-amt" {
    value = 0.45
    outputs {
      out = halo-scale-map.scale
    }
  }

  block "Const" "halo-scale-center" {
    value = 1.05
    outputs {
      out = halo-scale-map.bias
    }
  }

  block "ScaleBias" "halo-scale-map" {
    outputs {
      out = halo-scale-noise.amount
    }
  }

  block "Const" "halo-scale-base" {
    value = 1.0
    outputs {
      out = halo-scale-noise.value
    }
  }

  block "Const" "halo-scale-seed" {
    value = 27
    outputs {
      out = halo-scale-noise.seed
    }
  }

  block "NoisyBroadcast" "halo-scale-noise" {
    outputs {
      out = halo-render.scale
    }
  }

  block "RenderInstances2D" "halo-render" {}

  # --- Spiral branch: dense glowing core ---

  block "Ellipse" "spiral-dot" {
    rx = 0.010
    ry = 0.010
    outputs {
      controlPoints = spiral-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "spiral-wobble" {
    amount = 0.0016
    frequency = 9
    outputs {
      points = spiral-shape.controlPoints
    }
  }

  block "MakeShape2D" "spiral-shape" {
    closed = true
    outputs {
      shape = spiral-array.element
    }
  }

  block "InstanceDomain" "spiral-array" {
    count = 160
    outputs {
      index = spiral-layout.index
      rank = spiral-hue-shift.a
    }
  }

  block "ScatterUV" "spiral-layout" {

    outputs {
      uv = spiral-render.controlPoints
    }
  }

  block "Add" "spiral-hue-shift" {
    outputs {
      out = spiral-color.h
    }
  }

  block "MakeColorOKLCH" "spiral-color" {
    s = 0.88
    l = 0.60
    outputs {
      color = spiral-render.color
    }
  }

  block "Oscillator" "spiral-pulse" {
    outputs {
      out = spiral-scale-map.in
    }
  }

  block "Const" "spiral-scale-amt" {
    value = 0.35
    outputs {
      out = spiral-scale-map.scale
    }
  }

  block "Const" "spiral-scale-center" {
    value = 0.78
    outputs {
      out = spiral-scale-map.bias
    }
  }

  block "ScaleBias" "spiral-scale-map" {
    outputs {
      out = spiral-scale-noise.amount
    }
  }

  block "Const" "spiral-scale-base" {
    value = 0.82
    outputs {
      out = spiral-scale-noise.value
    }
  }

  block "Const" "spiral-scale-seed" {
    value = 39
    outputs {
      out = spiral-scale-noise.seed
    }
  }

  block "NoisyBroadcast" "spiral-scale-noise" {
    outputs {
      out = spiral-render.scale
    }
  }

  block "RenderInstances2D" "spiral-render" {}

  # --- Path branch: flowing necklace through the middle ---

  block "ProceduralPolygon" "path-polygon" {
    sides = 6
    radiusX = 0.28
    radiusY = 0.20
    outputs {
      controlPoints = path-layout.controlPoints
    }
  }

  block "Ellipse" "path-dot" {
    rx = 0.007
    ry = 0.007
    outputs {
      shape = path-array.element
    }
  }

  block "InstanceDomain" "path-array" {
    count = 72
    outputs {
      rank = [path-layout.t, path-hue-shift.a]
    }
  }

  block "SamplePath" "path-layout" {
    outputs {
      position = path-attractor.points
    }
  }

  block "AttractorLayout" "path-attractor" {
    strength = 0.45
    outputs {
      controlPoints = path-render.controlPoints
    }
  }

  block "Add" "path-hue-shift" {
    outputs {
      out = path-color.h
    }
  }

  block "MakeColorOKLCH" "path-color" {
    s = 1.0
    l = 0.78
    outputs {
      color = path-render.color
    }
  }

  block "Const" "path-scale" {
    value = 0.72
    outputs {
      out = path-render.scale
    }
  }

  block "RenderInstances2D" "path-render" {}
}
