# Mouse Spiral
#
# 24 circles responding to mouse input with per-element rainbow colors
# that shift over time. Click to grow circles.
# Demonstrates: ExternalInput blocks, mouse interaction, click-responsive scale.

patch "Mouse Spiral" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    periodBMs = 6000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
      phaseB = hue-add.b
    }
  }

  # Mouse inputs
  block "ExternalInput" "mouse-x" {
    channel = "mouse.x"
  }

  block "ExternalInput" "mouse-y" {
    channel = "mouse.y"
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
      t = hue-add.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.3
    outputs {
      position = render.pos
    }
  }

  # Click-responsive scale: baseSize + clickState * clickScale
  block "Const" "base-size" {
    value = 0.015
    outputs {
      out = final-size.a
    }
  }

  block "Const" "click-scale" {
    value = 0.015
    outputs {
      out = click-bonus.b
    }
  }

  block "Multiply" "click-bonus" {
    outputs {
      out = final-size.b
    }
  }

  block "Add" "final-size" {
    outputs {
      out = render.scale
    }
  }

  # Per-element animated rainbow
  block "Add" "hue-add" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
