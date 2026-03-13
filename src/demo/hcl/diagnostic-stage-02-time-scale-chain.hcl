# Diagnostic Stage 02: Time + Scalar Chain
#
# Purpose:
# - Verify InfiniteTimeRoot + Oscillator + ScaleBias scalar chain.
# - Verify one->many scale field broadcast via NoisyBroadcast.
# - Isolate time-domain behavior without Expression blocks.

patch "Diagnostic - Stage 02 Time Scale Chain" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4200
    role = "timeRoot"
    outputs {
      phaseA = [pulse.phase]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.011
    ry = 0.011
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 256
    outputs {
      elements = ring.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.32
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "Oscillator" "pulse" {
    outputs {
      out = pulse-map.in
    }
  }

  block "Const" "pulse-scale" {
    value = 0.28
    outputs {
      out = pulse-map.scale
    }
  }

  block "Const" "pulse-bias" {
    value = 0.74
    outputs {
      out = pulse-map.bias
    }
  }

  block "ScaleBias" "pulse-map" {
    outputs {
      out = scale-field.amount
    }
  }

  block "Const" "base-scale" {
    value = 0.72
    outputs {
      out = scale-field.value
    }
  }

  block "Const" "seed" {
    value = 7
    outputs {
      out = scale-field.seed
    }
  }

  block "NoisyBroadcast" "scale-field" {
    outputs {
      out = render.scale
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
