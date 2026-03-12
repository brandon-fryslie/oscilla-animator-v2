# Ripple Bloom
#
# Showcases ShapePolarRipple2D for petal-like radial modulation.

patch "Ripple Bloom" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = [ripple.phase, hue-shift.b]
    }
  }

  block "Rect" "anchors" {
    width = 0.14
    height = 0.14
    outputs {
      controlPoints = ripple.controlPoints
    }
  }

  block "ShapePolarRipple2D" "ripple" {
    amount = 0.05
    pointFrequency = 6.5
    radialFrequency = 4
    outputs {
      points = assemble.controlPoints
    }
  }

  block "MakeShape2D" "assemble" {
    closed = true
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 20
    outputs {
      elements = layout.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.4
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
