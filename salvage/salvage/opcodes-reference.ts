/**
 * OpCode Reference
 *
 * Operations the VM can perform. Blocks compile to opcode sequences.
 */

export const OpCode = {
  // Constants (0-9)
  Const: 0,

  // Time (10-19)
  TimeAbsMs: 10,      // Absolute time in ms
  TimeModelMs: 11,    // Model time in ms
  Phase01: 12,        // Phase [0,1] for cyclic time
  TimeDelta: 13,      // Delta between frames
  WrapEvent: 14,      // Trigger on phase wrap

  // Scalar Math (100-139)
  Add: 100, Sub: 101, Mul: 102, Div: 103, Mod: 104, Pow: 105,
  Sin: 110, Cos: 111, Tan: 112, Asin: 113, Acos: 114, Atan: 115, Atan2: 116,
  Abs: 120, Floor: 121, Ceil: 122, Round: 123, Fract: 124, Sign: 125,
  Min: 130, Max: 131, Clamp: 132, Lerp: 133, Step: 134, Smoothstep: 135,

  // Vec2 (200-219)
  Vec2Add: 200, Vec2Sub: 201, Vec2Mul: 202, Vec2Div: 203, Vec2Scale: 204,
  Vec2Dot: 210, Vec2Length: 211, Vec2Normalize: 212, Vec2Rotate: 213, Vec2Angle: 214,

  // Color (300-319)
  ColorLerp: 300,
  ColorHSLToRGB: 301,
  ColorRGBToHSL: 302,
  ColorShiftHue: 303,
  ColorScaleLight: 304,
  ColorScaleSat: 305,

  // State (400-419)
  Integrate: 400,      // Accumulator
  DelayMs: 401,        // Time-based delay
  DelayFrames: 402,    // Frame-based delay
  SampleHold: 403,     // Sample and hold on trigger
  Slew: 404,           // Slew rate limiter
  EdgeDetectWrap: 405, // Detect phase wrap

  // Domain/Identity (500-519)
  DomainN: 500,        // Create N elements
  DomainFromSVG: 501,  // Load from SVG
  Hash01ById: 510,     // Hash element ID to [0,1]
  IndexById: 511,      // Get element index

  // Field (600-619)
  FieldMap: 600,       // Map over field
  FieldZip: 601,       // Zip two fields
  FieldReduce: 602,    // Reduce to scalar
  FieldBroadcast: 603, // Broadcast scalar to field
  FieldFilter: 604,    // Filter by predicate

  // Render (700-719)
  RenderInstances2D: 700,
  RenderPath: 701,
  RenderRect: 702,
  RenderCircle: 703,

  // 3D (720-729)
  CameraEval: 720,
  MeshMaterialize: 721,
  Instances3DProjectTo2D: 722,

  // Transform (800-819)
  TransformScale: 800,
  TransformBias: 801,
  TransformEase: 802,
  TransformQuantize: 803,
  TransformNormalize: 804,
} as const;

export type OpCode = (typeof OpCode)[keyof typeof OpCode];

export type OpCodeCategory =
  | 'const' | 'time' | 'math' | 'vec' | 'color'
  | 'state' | 'domain' | 'field' | 'render' | '3d' | 'transform';

export type OpCodePurity = 'pure' | 'stateful' | 'io';
