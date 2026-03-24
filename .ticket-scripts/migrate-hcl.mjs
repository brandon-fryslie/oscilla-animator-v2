import fs from 'fs';
import path from 'path';

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
  
  // Replace references from upstream shape going into array
  // Old: shape = instances.element
  // New: shape = instances.element (already correct for InstanceDomain, it takes 'element')
  
  // t -> rank
  // Wait! if we use \bt\s*=, it might match things we don't want, but Array's output was `t`.
  // Array's output `t` maps to `rank`.
  content = content.replace(/\bt\s*=\s*([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g, 'rank = $1');

  // Replace instances.t -> instances.rank downstream
  content = content.replace(/([a-zA-Z0-9_-]+)\.t(\s|$)/g, '$1.rank$2');

  // Remove configuration properties for old layouts
  content = content.replace(/^\s*rows\s*=\s*[0-9]+.*$/gm, '');
  content = content.replace(/^\s*cols\s*=\s*[0-9]+.*$/gm, '');
  content = content.replace(/^\s*turns\s*=\s*[0-9.]+.*$/gm, '');
  content = content.replace(/^\s*expansion\s*=\s*[0-9.]+.*$/gm, '');

  // Change layout.controlPoints -> layout.uv in layout block outputs
  content = content.replace(/controlPoints\s*=\s*([a-zA-Z0-9_-]+)\.controlPoints/g, 'uv = $1.controlPoints');
  
  // Wait, if something was wiring 'grid.controlPoints' to 'some.input', we should change 'grid.controlPoints' to 'grid.uv'.
  // Let's replace '.controlPoints' with '.uv' for layout block outputs. Wait, we can't blindly replace `.controlPoints` because RenderInstances2D uses it.
  content = content.replace(/grid\.controlPoints/g, 'grid.uv');
  content = content.replace(/spiral\.controlPoints/g, 'spiral.uv');
  content = content.replace(/layout\.controlPoints/g, 'layout.uv');
  content = content.replace(/lattice\.controlPoints/g, 'lattice.uv');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Migrated:', file);
  }
});
