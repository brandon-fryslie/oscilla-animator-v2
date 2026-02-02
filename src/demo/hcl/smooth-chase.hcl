# Smooth Chase
#
# An oscillator drives a target value. A Lag block smoothly chases it.
# Both the raw and smoothed values drive separate ring scales,
# so you can see the Lag "catch up" to the oscillator.
#
# Demonstrates: Lag (exponential smoothing), dual render passes for comparison.

patch "Smooth Chase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2500
    periodBMs = 15000
    role = "timeRoot"
    outputs {
      phaseA = source.phase
    }
  }

  # --- Signal chain: oscillator → lag ---

  block "Oscillator" "source" {
    outputs {
      out = [smoother.target, raw-half.a]
    }
  }

  block "Lag" "smoother" {
    smoothing = 0.92
    initialValue = 0
    outputs {
      out = smooth-half.a
    }
  }

  # --- Scale mapping for both signals ---
  # Map oscillator [-1,1] → scale [0.5, 1.5]: scale = 1 + 0.5 * value

  block "Const" "half" {
    value = 0.5
    outputs {
      out = [raw-half.b, smooth-half.b]
    }
  }

  block "Const" "one" {
    value = 1
    outputs {
      out = [raw-scale.a, smooth-scale.a]
    }
  }

  # Raw oscillator scale
  block "Multiply" "raw-half" {
    outputs {
      out = raw-scale.b
    }
  }

  block "Add" "raw-scale" {
    outputs {
      out = render-raw.scale
    }
  }

  # Smoothed scale
  block "Multiply" "smooth-half" {
    outputs {
      out = smooth-scale.b
    }
  }

  block "Add" "smooth-scale" {
    outputs {
      out = render-smooth.scale
    }
  }

  # --- Outer ring: raw oscillator (jumpy) ---

  block "Ellipse" "outer-dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = [outer-instances.element, render-raw.shape]
    }
  }

  block "Array" "outer-instances" {
    count = 24
    outputs {
      elements = outer-ring.elements
    }
  }

  block "CircleLayoutUV" "outer-ring" {
    radius = 0.35
    outputs {
      position = render-raw.pos
    }
  }

  block "Const" "outer-color" {
    value = { r = 1, g = 0.3, b = 0.3, a = 0.7 }
    outputs {
      out = render-raw.color
    }
  }

  block "RenderInstances2D" "render-raw" {}

  # --- Inner ring: smoothed (silky) ---

  block "Ellipse" "inner-dot" {
    rx = 0.02
    ry = 0.02
    outputs {
      shape = [inner-instances.element, render-smooth.shape]
    }
  }

  block "Array" "inner-instances" {
    count = 12
    outputs {
      elements = inner-ring.elements
    }
  }

  block "CircleLayoutUV" "inner-ring" {
    radius = 0.18
    outputs {
      position = render-smooth.pos
    }
  }

  block "Const" "inner-color" {
    value = { r = 0.3, g = 1, b = 0.5, a = 1 }
    outputs {
      out = render-smooth.color
    }
  }

  block "RenderInstances2D" "render-smooth" {}
}
