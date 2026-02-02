# Mouse Reactive
#
# A ring of circles that responds to mouse input.
# Click to enlarge, move to... well, the mouse position is a signal,
# it doesn't directly move the ring — but it modulates the scale.
#
# Demonstrates: ExternalInput blocks, math chains, interactive patches.

patch "Mouse Reactive" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    periodBMs = 12000
    role = "timeRoot"
  }

  # --- Mouse input ---

  block "ExternalInput" "mouse-x" {
    channel = "mouse.x"
    outputs {
      value = mouse-contrib.a
    }
  }

  block "ExternalInput" "click" {
    channel = "mouse.button.left.held"
    outputs {
      value = click-contrib.a
    }
  }

  # --- Scale: base + click bonus ---
  #   base_scale = 0.8 + 0.4 * mouse_x   (mouse_x is ~0..1)
  #   click_bonus = 0.5 * click_state     (0 or 1)
  #   final_scale = base_scale + click_bonus

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

  # --- Visuals ---

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
    outputs {
      shape = [instances.element, render.shape]
    }
  }

  block "Array" "instances" {
    count = 16
    outputs {
      elements = ring.elements
    }
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.25
    outputs {
      position = render.pos
    }
  }

  block "Const" "color" {
    value = { r = 0.9, g = 0.5, b = 1, a = 1 }
    outputs {
      out = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
