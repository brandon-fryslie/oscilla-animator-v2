# Type 2 Lissajous Carousel
#
# Uses ShapeLissajous2D to create knot-like motion across a ring of ribbons.

patch "Type 2 Lissajous Carousel" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6100
    role = "timeRoot"
    outputs {
      phaseA = [liss.phase, hue-shift.b, thickness-map.in]
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.17
    radiusY = 0.11
    outputs {
      controlPoints = liss.controlPoints
    }
  }

  block "ShapeLissajous2D" "liss" {
    amountX = 0.045
    amountY = 0.032
    freqX = 4.5
    freqY = 7.25
    phaseSkew = 1.2
    outputs {
      points = type2-curve.controlPoints
    }
  }

  block "ParametricCurve2D" "type2-curve" {
    resolution = 98
    outputs {
      shape = instances.element
    }
  }

  block "Const" "thickness-amount" {
    value = 0.011
    outputs {
      out = thickness-map.scale
    }
  }

  block "Const" "thickness-bias" {
    value = 0.024
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
