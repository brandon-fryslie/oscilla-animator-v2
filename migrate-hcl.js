const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, callback);
    } else if (fullPath.endsWith('.hcl')) {
      callback(fullPath);
    }
  }
}

walk('src/demo/hcl', (file) => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace block types
  content = content.replace(/block "Array"/g, 'block "InstanceDomain"');
  content = content.replace(/block "GridLayoutUV"/g, 'block "ScatterUV"');
  content = content.replace(/block "SpiralLayout"/g, 'block "ScatterUV"');
  content = content.replace(/block "CircleLayoutUV"/g, 'block "ScatterUV"');

  // Replace outputs mapping for Array -> InstanceDomain
  content = content.replace(/elements\s*=\s*([a-zA-Z0-9_-]+)\.elements/g, 'index = $1.index');
  // t -> rank
  content = content.replace(/\bt\s*=\s*([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g, 'rank = $1');

  // Remove configuration properties for old layouts
  // This is a bit tricky, but since we know the common ones:
  content = content.replace(/^\s*rows\s*=\s*[0-9]+.*$/gm, '');
  content = content.replace(/^\s*cols\s*=\s*[0-9]+.*$/gm, '');
  content = content.replace(/^\s*turns\s*=\s*[0-9.]+.*$/gm, '');
  content = content.replace(/^\s*expansion\s*=\s*[0-9.]+.*$/gm, '');

  // Change layout.controlPoints -> layout.uv
  // We don't know the exact block name, but typically it's grid.controlPoints, spiral.controlPoints
  // We can just replace "controlPoints = render.controlPoints" with "uv = render.controlPoints"
  // Wait, what if it's "controlPoints = somethingElse"?
  // Inside the block "ScatterUV" "...", the output is `uv`.
  // Let's just blindly replace `controlPoints =` with `uv =` if it's inside the layout block?
  // Easier: just replace `controlPoints = ` with `uv = ` for the output mapping of layouts.
  // Actually, `RenderInstances2D` inputs `controlPoints`.
  // If a layout block maps its output to `render.controlPoints`, it looks like:
  // outputs {
  //   controlPoints = render.controlPoints
  // }
  // We want to change it to:
  // outputs {
  //   uv = render.controlPoints
  // }
  // We can do:
  content = content.replace(/controlPoints\s*=\s*([a-zA-Z0-9_-]+)\.controlPoints/g, 'uv = $1.controlPoints');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Migrated:', file);
  }
});
