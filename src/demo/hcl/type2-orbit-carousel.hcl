# Type 2 Orbit Carousel
#
# Uses ShapeOrbitShift2D + ShapeTwist2D for spinning ribbon petals.

patch "Type 2 Orbit Carousel" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6400
    role = "timeRoot"
    outputs {
      phaseA = [orbit.phase, twist.phase, hue-shift.b, thickness-map.in]
    }
  }

  block "ProceduralPolygon" "anchors" {
    sides = 4
    radiusX = 0.16
    radiusY = 0.11
    outputs {
      controlPoints = orbit.controlPoints
    }
  }

  block "ShapeOrbitShift2D" "orbit" {
    orbitTurns = 6.5
    radius = 0.038
    mix = 0.86
    outputs {
      points = twist.controlPoints
    }
  }

  block "ShapeTwist2D" "twist" {
    twistTurns = 0.7
    mix = 0.9
    outputs {
      points = type2-curve.controlPoints
    }
  }

  block "ParametricCurve2D" "type2-curve" {
    resolution = 100
    outputs {
      shape = instances.element
    }
  }

  block "Const" "thickness-amount" {
    value = 0.012
    outputs {
      out = thickness-map.scale
    }
  }

  block "Const" "thickness-bias" {
    value = 0.022
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
    count = 26
    outputs {
      elements = layout.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.37
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
