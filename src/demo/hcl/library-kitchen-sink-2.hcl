# Library Kitchen Sink 2
#
# Second broad-coverage demo emphasizing newer primitives:
# - event chain: EdgeTrigger -> PulseDivider -> ChanceGate -> EventToOneMask
# - scalar shaping: DomainWarpNoise1D / TurbulenceNoise1D / FbmNoise1D / Remap / Compare / Select / Lerp
# - vector math: Construct / Reflect / Dot / Cross / Distance / AngleBetween
# - transform path: SpiralLayout -> Transform2D -> Rotate2D -> RenderInstances2D
# - field variation: NoisyBroadcast + FloatRangeField

patch "Library Kitchen Sink 2" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 18000
    periodBMs = 6000
    role = "timeRoot"
    outputs {
      phaseA = [spiral.phase]
      phaseB = pulse-osc.phase
    }
  }

  block "Ellipse" "dot-shape" {
    rx = 0.010
    ry = 0.010
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 180
    outputs {
      elements = spiral.elements
    }
  }

  block "SpiralLayout" "spiral" {
    turns = 5.5
    spin = 1.05
    expansion = 0.68
    outputs {
      controlPoints = spiral-pos3.refs
    }
  }

  block "Expression" "spiral-pos3" {
    expression = "vec3(spiral.controlPoints.x, spiral.controlPoints.y, 0.0)"
    outputs {
      out = xform.position
    }
  }

  block "Transform2D" "xform" {
    scaleX = 0.9
    scaleY = 0.9
    outputs {
      out = rot2d.position
    }
  }

  block "Rotate2D" "rot2d" {
    outputs {
      out = rot2d-cp.refs
    }
  }

  block "Expression" "rot2d-cp" {
    expression = "vec2(rot2d.out.x, rot2d.out.y)"
    outputs {
      out = render.controlPoints
    }
  }

  block "RenderInstances2D" "render" {}

  # --- Event chain for live gating ---

  block "Oscillator" "pulse-osc" {
    mode = 0
    outputs {
      out = edge.value
    }
  }

  block "EdgeTrigger" "edge" {
    threshold = 0.62
    outputs {
      both = gate-mask.event
    }
  }

  block "EventToOneMask" "gate-mask" {
  }

  # --- Scalar field synthesis ---

  block "FloatRangeField" "range" {
    min = 0
    max = 1
    step = 0.007
    outputs {
      out = [warp.x, vec-b.x]
    }
  }

  block "Const" "warp-seed" {
    value = 41
    outputs {
      out = warp.seed
    }
  }

  block "DomainWarpNoise1D" "warp" {
    amount = 0.25
    outputs {
      out = [turb.x, fbm.x, vec-a.z]
    }
  }

  block "Const" "turb-seed" {
    value = 9
    outputs {
      out = turb.seed
    }
  }

  block "TurbulenceNoise1D" "turb" {
    outputs {
      out = [vec-a.y, select.ifFalse, compare.b]
    }
  }

  block "Const" "fbm-seed" {
    value = 23
    outputs {
      out = fbm.seed
    }
  }

  block "FbmNoise1D" "fbm" {
    outputs {
      out = [vec-a.x, select.ifTrue, compare.a]
    }
  }

  block "Compare" "compare" {
    op = "gt"
    outputs {
      out = [select.cond, vec-b.z]
    }
  }

  block "Select" "select" {
    outputs {
      out = vec-b.y
    }
  }

  # --- Vector graph + derived control values ---

  block "Construct" "vec-a" {
    outputs {
      out = [reflect.incident, dot.a]
    }
  }

  block "Construct" "vec-b" {
    outputs {
      out = [reflect.normal, dot.b, cross.a, distance.b, angle.b]
    }
  }

  block "Reflect" "reflect" {
    outputs {
      out = [distance.a, cross.b, angle.a]
    }
  }

  block "Dot" "dot" {
    outputs {
      out = dot-remap.in
    }
  }

  block "Cross" "cross" {
    outputs {
      out = [cross-x.in, cross-y.in, cross-z.in]
    }
  }

  block "Extract" "cross-x" {
    component = 0
    outputs {
      out = cross-len.x
    }
  }

  block "Extract" "cross-y" {
    component = 1
    outputs {
      out = cross-len.y
    }
  }

  block "Extract" "cross-z" {
    component = 2
    outputs {
      out = cross-len.z
    }
  }

  block "Length" "cross-len" {
    outputs {
      out = amount-remap.in
    }
  }

  block "Distance" "distance" {
    outputs {
      out = dist-remap.in
    }
  }

  block "AngleBetween" "angle" {
    outputs {
      out = rad-to-deg.in
    }
  }

  block "Adapter_RadiansToDegrees" "rad-to-deg" {
    outputs {
      out = xform.angleDeg
    }
  }

  block "Remap" "dot-remap" {
    inMin = -1
    inMax = 1
    outMin = 0
    outMax = 1
    mode = "clamp"
    outputs {
      out = [hue-phase.in, scalar-to-deg.in]
    }
  }

  block "Remap" "dist-remap" {
    inMin = 0
    inMax = 2
    outMin = 0
    outMax = 1
    mode = "clamp"
    outputs {
      out = xform.translateX
    }
  }

  block "Remap" "amount-remap" {
    inMin = 0
    inMax = 2
    outMin = 0.02
    outMax = 0.30
    mode = "clamp"
    outputs {
      out = xform.translateY
    }
  }

  block "Adapter_ScalarToDeg" "scalar-to-deg" {
    outputs {
      out = rot2d.angleDeg
    }
  }

  # --- Render styling ---

  block "Const" "scale-base" {
    value = 0.58
    outputs {
      out = scale-noise.value
    }
  }

  block "Const" "scale-amount" {
    value = 0.18
    outputs {
      out = scale-noise.amount
    }
  }

  block "Const" "scale-seed" {
    value = 33
    outputs {
      out = scale-noise.seed
    }
  }

  block "NoisyBroadcast" "scale-noise" {
    outputs {
      out = render.scale
    }
  }

  block "Adapter_ScalarToPhase01" "hue-phase" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.9
    l = 0.56
    outputs {
      color = render.color
    }
  }
}
