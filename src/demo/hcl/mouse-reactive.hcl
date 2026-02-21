# Mouse Reactive
#
# A ring of circles that responds to mouse input with Slew rate-limiting.
# Slew creates smooth, rate-limited tracking unlike Lag's exponential chase.
# Per-element rainbow color differentiates from mouse-spiral.
#
# Demonstrates: Slew rate-limiting, ExternalInput, per-element rainbow.

patch "Mouse Reactive" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  # --- Mouse input with Slew rate-limiting ---

  block "ExternalInput" "mouse-x" {
    channel = "mouse.x"
    outputs {
      value = slew-mouse.in
    }
  }

  block "Slew" "slew-mouse" {
    outputs {
      out = mouse-contrib.a
    }
  }

  block "ExternalInput" "click" {
    channel = "mouse.button.left.held"
    outputs {
      value = click-contrib.a
    }
  }

  # --- Scale: base + slewed mouse + click bonus ---

  block "Const" "scale-base" {
    value = 0.8
    outputs {
      out = base-scale.a
    }
  }

  block "Const" "scale-mouse-range" {
    value = 0.4
    outputs {
      out = mouse-contrib.b
    }
  }

  block "Multiply" "mouse-contrib" {
    outputs {
      out = base-scale.b
    }
  }

  block "Add" "base-scale" {
    outputs {
      out = final-scale.a
    }
  }

  block "Const" "click-amount" {
    value = 0.5
    outputs {
      out = click-contrib.b
    }
  }

  block "Multiply" "click-contrib" {
    outputs {
      out = final-scale.b
    }
  }

  block "Add" "final-scale" {
    outputs {
      out = render.scale
    }
  }

  # --- Visuals with per-element rainbow ---

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 16
    outputs {
      elements = ring.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.25
    outputs {
      position = render.pos
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
