# Mouse Spiral
#
# 24 circles responding to mouse input with Lag for silky tracking.
# Per-element rainbow colors. Click to grow circles.
# Demonstrates: Lag smoothing, ExternalInput, click-responsive scale.

patch "Mouse Spiral" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
    outputs {
      phaseA = [layout.phase, hue-shift.b]
    }
  }

  # Mouse inputs — Lag smooths the raw mouse.x for silky tracking
  block "ExternalInput" "mouse-x" {
    channel = "mouse.x"
    outputs {
      value = smooth-mouse.target
    }
  }

  block "Lag" "smooth-mouse" {
    smoothing = 0.9
    initialValue = 0.5
    outputs {
      out = mouse-contrib.a
    }
  }

  block "ExternalInput" "click-state" {
    channel = "mouse.button.left.held"
    outputs {
      value = click-bonus.a
    }
  }

  # Shape and instances
  block "Ellipse" "dot" {
    rx = 0.018
    ry = 0.018
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 32
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

  # Scale: smoothed mouse modulates base size, click adds bonus
  block "Const" "mouse-scale" {
    value = 0.95
    outputs {
      out = mouse-contrib.b
    }
  }

  block "Multiply" "mouse-contrib" {
    outputs {
      out = final-size.a
    }
  }

  block "Const" "base-size" {
    value = 0.35
    outputs {
      out = final-size.b
    }
  }

  block "Add" "final-size" {
    outputs {
      out = with-click.a
    }
  }

  block "Const" "click-scale" {
    value = 0.7
    outputs {
      out = click-bonus.b
    }
  }

  block "Multiply" "click-bonus" {
    outputs {
      out = with-click.b
    }
  }

  block "Add" "with-click" {
    outputs {
      out = render.scale
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  # Per-element rainbow
  block "MakeColorOKLCH" "color" {
    s = 0.94
    l = 0.72
    a = 0.94
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
