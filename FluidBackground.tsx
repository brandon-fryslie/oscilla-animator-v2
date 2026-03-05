/**
 * GPU fluid dynamics background using Three.js.
 *
 * Implements a real incompressible Navier-Stokes solver on the GPU:
 *   splat → curl → vorticity → divergence → pressure (Jacobi) →
 *   gradient subtract → advect velocity → advect dye → display
 *
 * Ping-pong WebGLRenderTargets carry the velocity and dye fields between
 * steps. Mouse movement and periodic auto-splats inject energy.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useMotionPreference } from '@/lib/motion/MotionProvider'

// ── Simulation constants ──────────────────────────────────────────────────────
const SIM_RES        = 128   // velocity / pressure grid resolution
const DYE_RES        = 512   // dye / colour field resolution
const PRESSURE_ITER  = 25    // Jacobi pressure iterations per frame
const CURL_STRENGTH  = 30    // vorticity confinement (adds turbulent swirls)
const VEL_DISSIPATION = 0.985
const DYE_DISSIPATION = 0.991
const AUTO_SPLAT_MS  = 2200  // milliseconds between autonomous splats

// ── GLSL shaders ─────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`

// Add velocity / colour impulse at a point (Gaussian footprint)
const SPLAT_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float     aspectRatio;
  uniform vec3      color;
  uniform vec2      point;
  uniform float     radius;
  void main() {
    vec2 p = vUv - point;
    p.x   *= aspectRatio;
    float d = exp(-dot(p,p) / radius);
    gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + d * color, 1.0);
  }
`

// Semi-Lagrangian advection — back-trace along velocity field
const ADVECT_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform float     dt;
  uniform float     dissipation;
  void main() {
    vec2 vel   = texture2D(uVelocity, vUv).xy;
    vec2 coord = vUv - dt * vel;
    gl_FragColor = vec4(dissipation * texture2D(uSource, coord).xyz, 1.0);
  }
`

// ∇·u  (divergence of velocity)
const DIV_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2      texelSize;
  void main() {
    float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
    float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
    float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
  }
`

// ω = ∂v/∂x − ∂u/∂y  (scalar 2-D curl)
const CURL_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2      texelSize;
  void main() {
    float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
    float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
    float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
    float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
    gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
  }
`

// Vorticity confinement — amplify existing rotation to fight numerical dissipation
const VORT_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform vec2      texelSize;
  uniform float     curlStrength;
  uniform float     dt;
  void main() {
    float L = texture2D(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
    float T = texture2D(uCurl, vUv + vec2(0.0, texelSize.y)).x;
    float B = texture2D(uCurl, vUv - vec2(0.0, texelSize.y)).x;
    float C = texture2D(uCurl, vUv).x;
    vec2  N = vec2(abs(T) - abs(B), abs(R) - abs(L));
    N = N / (length(N) + 1e-5) * curlStrength * C;
    N.y *= -1.0;
    vec2 vel = texture2D(uVelocity, vUv).xy;
    gl_FragColor = vec4(vel + N * dt, 0.0, 1.0);
  }
`

// Jacobi iteration for ∇²p = ∇·u
const PRESSURE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2      texelSize;
  void main() {
    float L   = texture2D(uPressure,   vUv - vec2(texelSize.x, 0.0)).x;
    float R   = texture2D(uPressure,   vUv + vec2(texelSize.x, 0.0)).x;
    float T   = texture2D(uPressure,   vUv + vec2(0.0, texelSize.y)).x;
    float B   = texture2D(uPressure,   vUv - vec2(0.0, texelSize.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + T + B - div) * 0.25, 0.0, 0.0, 1.0);
  }
`

// u = u − ∇p   (project to divergence-free field)
const GRAD_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2      texelSize;
  void main() {
    float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
    vec2 vel = texture2D(uVelocity, vUv).xy;
    gl_FragColor = vec4(vel - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
  }
`

// Tone-map dye field onto deep dark background
const DISPLAY_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  void main() {
    vec3  c   = texture2D(uTexture, vUv).rgb;
    // Amplify + saturate
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(lum), c, 1.6);      // boost saturation
    c = c * 1.8;                      // overall brightness
    // Additive blend over deep navy background
    vec3 bg = vec3(0.028, 0.028, 0.07);
    gl_FragColor = vec4(bg + c, 1.0);
  }
`

// ── Ping-pong render target ───────────────────────────────────────────────────

class DoubleFBO {
  private a: THREE.WebGLRenderTarget
  private b: THREE.WebGLRenderTarget
  get read()  { return this.a }
  get write() { return this.b }
  constructor(w: number, h: number, opts: THREE.WebGLRenderTargetOptions) {
    this.a = new THREE.WebGLRenderTarget(w, h, opts)
    this.b = new THREE.WebGLRenderTarget(w, h, opts)
  }
  swap() { [this.a, this.b] = [this.b, this.a] }
  dispose() { this.a.dispose(); this.b.dispose() }
}

// ── Splat colour palette ──────────────────────────────────────────────────────

const COLORS = [
  [0.05, 0.20, 1.00],  // electric blue
  [0.55, 0.05, 1.00],  // violet
  [0.00, 0.80, 1.00],  // cyan
  [1.00, 0.10, 0.55],  // hot pink
  [1.00, 0.45, 0.00],  // orange
  [0.05, 0.90, 0.45],  // emerald
  [0.80, 0.00, 0.30],  // crimson
  [0.20, 0.55, 1.00],  // periwinkle
]

// ── Component ─────────────────────────────────────────────────────────────────

export function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { shouldAnimate } = useMotionPreference()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !shouldAnimate) return

    // Make app shell transparent so the canvas shows through
    const prevBodyBg = document.body.style.backgroundColor
    const prevBodyVar = document.body.style.getPropertyValue('--mantine-color-body')
    document.body.style.backgroundColor = 'transparent'
    document.body.style.setProperty('--mantine-color-body', 'transparent')

    // Inject global styles that make Mantine surfaces semi-transparent with blur
    const styleEl = document.createElement('style')
    styleEl.id = 'fluid-bg-glass'
    styleEl.textContent = `
      :root { --fluid-glass-bg: rgba(13, 13, 28, 0.62); --fluid-glass-blur: 14px; }
      .mantine-AppShell-header,
      .mantine-AppShell-navbar {
        background: var(--fluid-glass-bg) !important;
        backdrop-filter: blur(var(--fluid-glass-blur)) saturate(1.4) !important;
        -webkit-backdrop-filter: blur(var(--fluid-glass-blur)) saturate(1.4) !important;
        border-color: rgba(255,255,255,0.07) !important;
      }
      .mantine-AppShell-main {
        background: transparent !important;
      }
      .mantine-Card-root {
        background: rgba(13, 13, 28, 0.55) !important;
        backdrop-filter: blur(10px) saturate(1.3) !important;
        -webkit-backdrop-filter: blur(10px) saturate(1.3) !important;
        border-color: rgba(255,255,255,0.08) !important;
      }
      .mantine-Modal-content {
        background: rgba(13, 13, 28, 0.80) !important;
        backdrop-filter: blur(20px) saturate(1.5) !important;
        -webkit-backdrop-filter: blur(20px) saturate(1.5) !important;
      }
      .mantine-Modal-overlay {
        background: rgba(0,0,0,0.45) !important;
        backdrop-filter: blur(2px) !important;
      }
    `
    document.head.appendChild(styleEl)

    // ── Renderer ────────────────────────────────────────────────────────────
    const W = window.innerWidth
    const H = window.innerHeight
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(1)
    renderer.setSize(W, H, false)
    renderer.setClearColor(0x070714, 1)

    // Fullscreen quad scene
    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad   = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    scene.add(quad)

    const draw = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
      quad.material = mat
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
    }

    // ── Render targets ───────────────────────────────────────────────────────
    const opts: THREE.WebGLRenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS:     THREE.ClampToEdgeWrapping,
      wrapT:     THREE.ClampToEdgeWrapping,
      format:    THREE.RGBAFormat,
      type:      THREE.HalfFloatType,
    }
    const velocity   = new DoubleFBO(SIM_RES, SIM_RES, opts)
    const dye        = new DoubleFBO(DYE_RES, DYE_RES, opts)
    const pressure   = new DoubleFBO(SIM_RES, SIM_RES, opts)
    const divTarget  = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts)
    const curlTarget = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts)

    // ── Shader materials ─────────────────────────────────────────────────────
    const mat = (frag: string, u: Record<string, { value: unknown }> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: u })

    const simTS = new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES)

    const splatM   = mat(SPLAT_FRAG, {
      uTarget: { value: null }, aspectRatio: { value: W / H },
      color:   { value: new THREE.Vector3() }, point: { value: new THREE.Vector2() },
      radius:  { value: 0.08 },
    })
    const advectM  = mat(ADVECT_FRAG, {
      uVelocity: { value: null }, uSource: { value: null },
      dt: { value: 0.016 }, dissipation: { value: 1 },
    })
    const divM     = mat(DIV_FRAG,      { uVelocity: { value: null }, texelSize: { value: simTS } })
    const curlM    = mat(CURL_FRAG,     { uVelocity: { value: null }, texelSize: { value: simTS } })
    const vortM    = mat(VORT_FRAG,     {
      uVelocity: { value: null }, uCurl: { value: null }, texelSize: { value: simTS },
      curlStrength: { value: CURL_STRENGTH }, dt: { value: 0.016 },
    })
    const pressM   = mat(PRESSURE_FRAG, {
      uPressure: { value: null }, uDivergence: { value: null }, texelSize: { value: simTS },
    })
    const gradM    = mat(GRAD_FRAG,     {
      uPressure: { value: null }, uVelocity: { value: null }, texelSize: { value: simTS },
    })
    const displayM = mat(DISPLAY_FRAG,  { uTexture: { value: null } })

    // ── Splat helper ─────────────────────────────────────────────────────────
    const splat = (
      x: number, y: number, dx: number, dy: number, col: number[],
      dyeRadius = 0.05, dyeScale = 1.0,
    ) => {
      // Velocity impulse
      splatM.uniforms.uTarget.value      = velocity.read.texture
      splatM.uniforms.aspectRatio.value  = W / H
      splatM.uniforms.point.value.set(x, y)
      splatM.uniforms.color.value.set(dx, dy, 0)
      splatM.uniforms.radius.value       = 0.006
      draw(splatM, velocity.write)
      velocity.swap()

      // Dye impulse
      splatM.uniforms.uTarget.value      = dye.read.texture
      splatM.uniforms.color.value.set(col[0] * dyeScale, col[1] * dyeScale, col[2] * dyeScale)
      splatM.uniforms.radius.value       = dyeRadius
      draw(splatM, dye.write)
      dye.swap()
    }

    // ── Mouse input ──────────────────────────────────────────────────────────
    let lx = -1, ly = -1
    const onMove = (e: MouseEvent) => {
      const x  = e.clientX / W
      const y  = 1 - e.clientY / H
      const dx = lx < 0 ? 0 : (x - lx) * 18
      const dy = ly < 0 ? 0 : (y - ly) * 18
      if (Math.abs(dx) + Math.abs(dy) > 0.0008)
        // Smaller, dimmer splat under cursor so UI stays readable
        splat(x, y, dx, dy, COLORS[Math.floor(Math.random() * COLORS.length)], 0.022, 0.45)
      lx = x; ly = y
    }
    window.addEventListener('mousemove', onMove)

    // ── Autonomous splats ────────────────────────────────────────────────────
    const autoSplat = () => {
      const a   = Math.random() * Math.PI * 2
      const spd = 0.25 + Math.random() * 0.55
      splat(
        Math.random(), Math.random(),
        Math.cos(a) * spd, Math.sin(a) * spd,
        COLORS[Math.floor(Math.random() * COLORS.length)],
      )
    }
    // Prime the field
    for (let i = 0; i < 8; i++) autoSplat()
    const autoId = setInterval(autoSplat, AUTO_SPLAT_MS)

    // ── Simulation step ───────────────────────────────────────────────────────
    const step = (dt: number) => {
      // Curl
      curlM.uniforms.uVelocity.value = velocity.read.texture
      draw(curlM, curlTarget)

      // Vorticity confinement
      vortM.uniforms.uVelocity.value = velocity.read.texture
      vortM.uniforms.uCurl.value     = curlTarget.texture
      vortM.uniforms.dt.value        = dt
      draw(vortM, velocity.write);  velocity.swap()

      // Divergence
      divM.uniforms.uVelocity.value = velocity.read.texture
      draw(divM, divTarget)

      // Pressure — Jacobi iterations
      pressM.uniforms.uDivergence.value = divTarget.texture
      for (let i = 0; i < PRESSURE_ITER; i++) {
        pressM.uniforms.uPressure.value = pressure.read.texture
        draw(pressM, pressure.write);  pressure.swap()
      }

      // Gradient subtract → divergence-free velocity
      gradM.uniforms.uPressure.value  = pressure.read.texture
      gradM.uniforms.uVelocity.value  = velocity.read.texture
      draw(gradM, velocity.write);  velocity.swap()

      // Advect velocity
      advectM.uniforms.uVelocity.value    = velocity.read.texture
      advectM.uniforms.uSource.value      = velocity.read.texture
      advectM.uniforms.dt.value           = dt
      advectM.uniforms.dissipation.value  = VEL_DISSIPATION
      draw(advectM, velocity.write);  velocity.swap()

      // Advect dye
      advectM.uniforms.uSource.value     = dye.read.texture
      advectM.uniforms.dissipation.value = DYE_DISSIPATION
      draw(advectM, dye.write);  dye.swap()
    }

    // ── Render loop ──────────────────────────────────────────────────────────
    let rafId: number
    let last = performance.now()
    const loop = () => {
      rafId   = requestAnimationFrame(loop)
      const now = performance.now()
      const dt  = Math.min((now - last) / 1000, 0.033)
      last    = now
      step(dt)
      displayM.uniforms.uTexture.value = dye.read.texture
      draw(displayM, null)
    }
    loop()

    // ── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => renderer.setSize(window.innerWidth, window.innerHeight, false)
    window.addEventListener('resize', onResize)

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(autoId)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)

      // Restore background and remove injected styles
      document.body.style.backgroundColor = prevBodyBg
      if (prevBodyVar) document.body.style.setProperty('--mantine-color-body', prevBodyVar)
      else             document.body.style.removeProperty('--mantine-color-body')
      document.getElementById('fluid-bg-glass')?.remove()

      velocity.dispose(); dye.dispose(); pressure.dispose()
      divTarget.dispose(); curlTarget.dispose()
      ;[splatM, advectM, divM, curlM, vortM, pressM, gradM, displayM].forEach(m => m.dispose())
      quad.geometry.dispose()
      renderer.dispose()
    }
  }, [shouldAnimate])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -1 }}
    />
  )
}
