# Type 2 Squish Samba
#
# Uses ShapeLissajous2D + ShapeSquishWave2D for bouncy knot-like ribbons.

patch "Type 2 Squish Samba" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6000
    role = "timeRoot"
    outputs {
      phaseA = [liss.phase, squish.phase, hue-shift.b, thickness-map.in]
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.18
    radiusY = 0.1
    outputs {
      controlPoints = liss.controlPoints
    }
  }

  block "ShapeLissajous2D" "liss" {
    amountX = 0.042
    amountY = 0.03
    freqX = 4.8
    freqY = 7.4
    phaseSkew = 1.3
    outputs {
      points = squish.controlPoints
    }
  }

  block "ShapeSquishWave2D" "squish" {
    amount = 0.44
    frequency = 6.6
    mix = 0.88
    outputs {
      points = type2-curve.controlPoints
    }
  }

  block "ParametricCurve2D" "type2-curve" {
    resolution = 102
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
    value = 0.021
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
    count = 24
    outputs {
      elements = layout.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.36
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
