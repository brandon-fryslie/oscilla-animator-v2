# Type 2 Radial Pulse Party
#
# Uses ShapeRadialPulse2D for rhythmic expansion/contraction.

patch "Type 2 Radial Pulse Party" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5400
    role = "timeRoot"
    outputs {
      phaseA = [pulse.phase, hue-shift.b, thickness-map.in]
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.15
    radiusY = 0.1
    outputs {
      controlPoints = pulse.controlPoints
    }
  }

  block "ShapeRadialPulse2D" "pulse" {
    amount = 0.34
    frequency = 6
    mix = 0.92
    outputs {
      points = type2-curve.controlPoints
    }
  }

  block "ParametricCurve2D" "type2-curve" {
    resolution = 92
    outputs {
      shape = instances.element
    }
  }

  block "Const" "thickness-amount" {
    value = 0.013
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
    count = 22
    outputs {
      elements = layout.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.35
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
