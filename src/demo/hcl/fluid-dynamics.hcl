# Fluid Dynamics
#
# Steel-thread demo patch for the fluid-first GPU pass bundle path:
# FluidDynamics2D block -> compile-generated fluid WGSL passes -> Rust worker renderer.

patch "Fluid Dynamics" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    role = "timeRoot"
  }

  block "Ellipse" "dot" {
    rx = 0.5
    ry = 0.5
    outputs {
      shape = fluid.shape
    }
  }

  block "FluidDynamics2D" "fluid" {
    count = 8192
    simResolution = 128
    velocityDissipation = 0.992
    dyeDissipation = 0.996
    vorticity = 18
    splatRadius = 20
    advection = 1.0
    particleScale = 0.02
    outputs {
      controlPoints = render.controlPoints
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
