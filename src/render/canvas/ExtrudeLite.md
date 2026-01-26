Yes: do a 2.5D “relief” projection in the renderer that turns each 2D shape into two paths + a quad-strip side band, with flat shading from a fixed light direction. It looks like extrusion, costs little, and doesn’t require meshes, normals, or WebGL.

Stub: “ExtrudeLite” at render time (no new payloads)

Inputs (signals)
•	heightPx (float, pixels) — small, e.g. 2–12
•	lightDir2 (vec2-like encoded as two floats or fixed constant) — e.g. (-0.6, -0.8)
•	shadeStrength (float 0..1) — e.g. 0.25
•	sideAlpha (float 0..1) — e.g. 0.9

Core idea

For each instance:
1.	Compute a screen-space offset d = normalize(lightDir2) * heightPx.
2.	Draw:
•	Back face: shape translated by +d (darker)
•	Side band: connect corresponding edges between original shape and translated shape
•	Front face: original shape (original color)

This creates the illusion of depth with 2–3 draw calls per shape.

How to do it for polygons (fast, easiest)

Assume your shape is (or can be represented as) one or more closed rings of points.

For one ring p[i]:
•	p2[i] = p[i] + d
•	Side band per edge (i→i+1) is a quad: p[i], p[i+1], p2[i+1], p2[i]
•	Shade per edge based on how “facing the light” the edge is:
•	edge dir e = normalize(p[i+1] - p[i])
•	outward-ish normal in 2D n = perp(e) (pick consistent winding)
•	intensity k = clamp01(0.5 + 0.5 * dot(n, normalize(lightDir2)))
•	side color = mix(baseColor * 0.6, baseColor * 1.0, k) then apply shadeStrength

Draw order:
1.	back face (translated)
2.	side quads (in ring order)
3.	front face

Canvas2D
•	Back face: ctx.save(); ctx.translate(dx, dy); fillPath(); ctx.restore();
•	Side quads: ctx.beginPath(); moveTo(p[i]); lineTo(p[i+1]); lineTo(p2[i+1]); lineTo(p2[i]); closePath(); fill();
•	Front face: fillPath()

SVG
•	Back face: duplicate <path> with transform="translate(dx,dy)" and darker fill.
•	Side band: emit <path> per edge quad (or fewer, by batching contiguous quads into one path if you want).
•	Front face: original <path>.

This is extremely compatible with your current SVG target.

What this does not do (and that’s fine for a stub)
•	No true perspective, no real Z, no self-occlusion beyond simple draw order.
•	Bevel is faked: you can add a thin highlight stroke on the front face to hint bevel.
•	Complex paths with holes: still doable, but “side band” is harder unless you have explicit rings; start with polygon-only or “simple paths only”.

Make it cleanly removable later

Treat this as a renderer-only style mode, not a semantic geometry feature:
•	Add a render style flag on the op: depthStyle: 'flat' | 'extrudeLite'
•	Keep it behind one function: drawExtrudeLite(shapePathOrPolygon, color, dxdy, params)
•	Do not change IR, payloads, or slot allocation for this stub.

When you later introduce real mesh3d + ExtrudeBevel, you delete extrudeLite and switch the style to “mesh shading”.

Minimal “bevel hint” that costs almost nothing

After drawing the front face:
•	Draw a 1px stroke with slightly lighter color and low alpha on the top-left edges only:
•	For polygons: stroke just the edges whose normal aligns with -lightDir2.
•	For general paths: simplest is a full stroke with low alpha (less correct, still helps).

This produces “beveled vibes” without geometry.

That’s the stub that gives you “just the slightest bit” of 3D while keeping your architecture intact.