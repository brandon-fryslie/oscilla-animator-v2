# Twist Garden
#
# Showcases ShapeTwist2D driving a ring of animated stamped paths.

patch "Twist Garden" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5600
    role = "timeRoot"
    outputs {
      phaseA = [twist.phase, twist-map.in, hue-shift.b]
    }
  }

  block "Rect" "anchors" {
    width = 0.18
    height = 0.12
    outputs {
      controlPoints = twist.controlPoints
    }
  }

  block "Const" "twist-scale" {
    value = 1.2
    outputs {
      out = twist-map.scale
    }
  }

  block "Const" "twist-bias" {
    value = -0.55
    outputs {
      out = twist-map.bias
    }
  }

  block "ScaleBias" "twist-map" {
    outputs {
      out = twist.twistTurns
    }
  }

  block "ShapeTwist2D" "twist" {
    mix = 0.92
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
    count = 26
    outputs {
      elements = layout.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.34
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
