# Neon Vortex
#
# Combines ShapeTwist2D + ShapePolarRipple2D + ShapeWobble2D for layered motion.

patch "Neon Vortex" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6200
    role = "timeRoot"
    outputs {
      phaseA = [twist.phase, ripple.phase, wobble.phase, hue-shift.b]
    }
  }

  block "Rect" "anchors" {
    width = 0.17
    height = 0.11
    outputs {
      controlPoints = twist.controlPoints
    }
  }

  block "ShapeTwist2D" "twist" {
    twistTurns = 0.95
    mix = 0.88
    outputs {
      points = ripple.controlPoints
    }
  }

  block "ShapePolarRipple2D" "ripple" {
    amount = 0.038
    pointFrequency = 5.3
    radialFrequency = 3.4
    outputs {
      points = wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "wobble" {
    amount = 0.028
    frequency = 3.8
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
    count = 30
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
