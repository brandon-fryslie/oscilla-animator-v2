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
      controlPoints = render.controlPoints
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
