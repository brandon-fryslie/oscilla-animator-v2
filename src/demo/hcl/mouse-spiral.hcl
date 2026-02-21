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
      phaseA = layout.phase
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
    rx = 0.02
    ry = 0.02
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 24
    outputs {
      elements = layout.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.3
    outputs {
      position = render.pos
    }
  }

  # Scale: smoothed mouse modulates base size, click adds bonus
  block "Const" "mouse-scale" {
    value = 0.8
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
    value = 0.4
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
    value = 0.5
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

  # Per-element rainbow
  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
