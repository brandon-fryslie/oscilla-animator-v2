# Orbit
#
# A spiral built from scratch using Sin, Cos, and Construct.
# No pre-built layout — positions computed from polar math:
#   theta = t * 18.85 (3 turns of radians)
#   r = t * 0.4 (linear expansion)
#   x = r * cos(theta + time), y = r * sin(theta + time)
#
# Demonstrates: Sin, Cos, Construct (float → vec3),
#               polar-to-cartesian math, per-element rainbow.

patch "Orbit" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6000
    periodBMs = 12000
    role = "timeRoot"
    outputs {
      phaseA = time-scale.a
      phaseB = color-shift.b
    }
  }

  # --- Shape + instances ---

  block "Ellipse" "dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 100
    outputs {
      elements = render.elements
      t = [theta-scale.a, r-scale.a, color-shift.a, dot-scale.in]
    }
  }

  # --- Spiral angle: theta = t * 18.85 (3 turns) ---

  block "Const" "max-angle" {
    value = 18.8496
    outputs {
      out = theta-scale.b
    }
  }

  block "Multiply" "theta-scale" {
    outputs {
      out = theta.a
    }
  }

  # --- Add time-based rotation: theta + phaseA * 2pi ---

  block "Const" "two-pi" {
    value = 6.2832
    outputs {
      out = time-scale.b
    }
  }

  block "Multiply" "time-scale" {
    outputs {
      out = theta.b
    }
  }

  block "Add" "theta" {
    outputs {
      out = [cos-theta.input, sin-theta.input]
    }
  }

  # --- Radius: r = t * 0.4 ---

  block "Const" "expansion" {
    value = 0.4
    outputs {
      out = r-scale.b
    }
  }

  block "Multiply" "r-scale" {
    outputs {
      out = [make-x.a, make-y.a]
    }
  }

  # --- Trig: cos(theta), sin(theta) ---

  block "Cos" "cos-theta" {
    outputs {
      result = make-x.b
    }
  }

  block "Sin" "sin-theta" {
    outputs {
      result = make-y.b
    }
  }

  # --- Cartesian: x = r * cos(theta), y = r * sin(theta) ---

  block "Multiply" "make-x" {
    outputs {
      out = pos.x
    }
  }

  block "Multiply" "make-y" {
    outputs {
      out = pos.y
    }
  }

  # --- Construct vec3 position ---

  block "Construct" "pos" {
    outputs {
      out = render.pos
    }
  }

  # --- Per-element rainbow shifted by time ---

  block "Add" "color-shift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  # --- Dots grow from center to edge: scale = t * 1.5 + 0.3 ---

  block "Const" "scale-amt" {
    value = 1.5
    outputs {
      out = dot-scale.scale
    }
  }

  block "Const" "scale-base" {
    value = 0.3
    outputs {
      out = dot-scale.bias
    }
  }

  block "ScaleBias" "dot-scale" {
    outputs {
      out = render.scale
    }
  }

  block "RenderInstances2D" "render" {}
}
