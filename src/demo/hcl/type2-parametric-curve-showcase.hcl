# Type 2 Parametric Curve Showcase
#
# Demonstrates Type 2 cubic-curve shapes rendered as animated ribbons.
# Control points come from a 4-point polygon source and are deformed over time.

patch "Type 2 Parametric Curve Showcase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6000
    role = "timeRoot"
    outputs {
      phaseA = [curve-wobble.phase, hue-shift.b, thickness-map.in]
    }
  }

  block "ProceduralPolygon" "curve-anchors" {
    sides = 4
    radiusX = 0.18
    radiusY = 0.14
    outputs {
      controlPoints = curve-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "curve-wobble" {
    amount = 0.09
    frequency = 3.2
    outputs {
      points = type2-curve.controlPoints
    }
  }

  block "ParametricCurve2D" "type2-curve" {
    resolution = 96
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
    value = 0.028
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
    count = 28
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
