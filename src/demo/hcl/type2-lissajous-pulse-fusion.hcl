# Type 2 Lissajous Pulse Fusion
#
# Chains ShapeLissajous2D + ShapeRadialPulse2D into a dense animated ribbon ring.

patch "Type 2 Lissajous Pulse Fusion" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6800
    role = "timeRoot"
    outputs {
      phaseA = [liss.phase, pulse.phase, pulse-mix-map.in, thickness-map.in, hue-shift.b]
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.18
    radiusY = 0.12
    outputs {
      controlPoints = liss.controlPoints
    }
  }

  block "ShapeLissajous2D" "liss" {
    amountX = 0.05
    amountY = 0.035
    freqX = 5
    freqY = 7.5
    phaseSkew = 1.35
    outputs {
      points = pulse.controlPoints
    }
  }

  block "ShapeRadialPulse2D" "pulse" {
    amount = 0.3
    frequency = 6.5
    outputs {
      points = type2-curve.controlPoints
    }
  }

  block "ParametricCurve2D" "type2-curve" {
    resolution = 104
    outputs {
      shape = instances.element
    }
  }

  block "Const" "pulse-mix-scale" {
    value = 0.45
    outputs {
      out = pulse-mix-map.scale
    }
  }

  block "Const" "pulse-mix-bias" {
    value = 0.55
    outputs {
      out = pulse-mix-map.bias
    }
  }

  block "ScaleBias" "pulse-mix-map" {
    outputs {
      out = pulse.mix
    }
  }

  block "Const" "thickness-amount" {
    value = 0.014
    outputs {
      out = thickness-map.scale
    }
  }

  block "Const" "thickness-bias" {
    value = 0.02
    outputs {
      out = thickness-map.bias
    }
  }

  block "ScaleBias" "thickness-map" {
    outputs {
      out = type2-curve.thickness
    }
  }

  block "Array" "instances" {
    count = 30
    outputs {
      elements = layout.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.39
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
