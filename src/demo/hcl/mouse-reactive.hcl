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
      controlPoints = render.controlPoints
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}

  # spice_overlay_v2: radial accent layer
  block "Rect" "spicea_tile" {
    width = 0.009
    height = 0.009
    cornerRadius = 0.002
    outputs {
      shape = spicea_instances.element
    }
  }

  block "Array" "spicea_instances" {
    count = 36
    outputs {
      elements = spicea_layout.elements
      t = [spicea_offset.refs, spicea_color.h]
    }
  }

  block "CircleLayoutUV" "spicea_layout" {
    radius = 0.44
    outputs {
      controlPoints = spicea_offset.refs
    }
  }

  block "Expression" "spicea_offset" {
    expression = <<-EXPR
      lane = spicea_instances.t * 31.4159
      x = spicea_layout.controlPoints.x + 0.018 * sin(lane)
      y = spicea_layout.controlPoints.y + 0.018 * cos(lane * 1.3)
      vec2(x, y)
    EXPR
    outputs {
      out = spicea_render.controlPoints
    }
  }

  block "Const" "spicea_scale" {
    value = 0.38
    outputs {
      out = spicea_render.scale
    }
  }

  block "Const" "spicea_sat" {
    value = 0.84
    outputs {
      out = spicea_color.s
    }
  }

  block "Const" "spicea_light" {
    value = 0.72
    outputs {
      out = spicea_color.l
    }
  }

  block "Const" "spicea_alpha" {
    value = 0.7
    outputs {
      out = spicea_color.a
    }
  }

  block "MakeColorOKLCH" "spicea_color" {
    outputs {
      color = spicea_render.color
    }
  }

  block "RenderInstances2D" "spicea_render" {}

}
