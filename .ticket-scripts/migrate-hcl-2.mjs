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

  // Scrub old layout parameters
  content = content.replace(/^\s*radius\s*=\s*[0-9.]+.*$/gm, '');
  content = content.replace(/^\s*spin\s*=\s*[0-9.]+.*$/gm, '');
  content = content.replace(/^\s*rows\s*=\s*[0-9]+.*$/gm, '');
  content = content.replace(/^\s*cols\s*=\s*[0-9]+.*$/gm, '');
  content = content.replace(/^\s*turns\s*=\s*[0-9.]+.*$/gm, '');
  content = content.replace(/^\s*expansion\s*=\s*[0-9.]+.*$/gm, '');

  // Remove elements input mapping for downstream blocks that were trying to accept Array.elements 
  // Wait, if something was wiring layout.elements, we changed it to index.
  // Let's remove any line that wires `something = something.rotation` or `something = something.scale` where the source was a layout block.
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*=\s*[a-zA-Z0-9_-]+\.rotation\s*$/gm, '');
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*=\s*[a-zA-Z0-9_-]+\.scale\s*$/gm, '');

  // Wait, earlier we replaced "block Array" with "block InstanceDomain".
  // InstanceDomain doesn't output 'elements', so any wire from it that's NOT rank or index is invalid.
  // Array used to output 't' and 'elements'.
  // Our previous script replaced 't =' with 'rank =' and 'elements =' with 'index ='.
  // Let's remove any remaining `.elements` from the file.
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*=\s*[a-zA-Z0-9_-]+\.elements\s*$/gm, '');
  content = content.replace(/^\s*elements\s*=\s*[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\s*$/gm, '');
  
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*=\s*[a-zA-Z0-9_-]+\.t\s*$/gm, '');
  content = content.replace(/^\s*t\s*=\s*[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\s*$/gm, '');

  // Let's also remove `controlPoints` from ScatterUV because it only outputs `uv`
  content = content.replace(/^\s*controlPoints\s*=\s*[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\s*$/gm, '');

  // Now, we need to ensure that the layout blocks are wired correctly.
  // Layout block (ScatterUV) needs 'index' input from InstanceDomain.
  // Let's manually ensure ScatterUV has `index = instances.index` and outputs `uv = render.controlPoints`.
  // It's tricky to do this with regex without breaking other blocks.
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Migrated:', file);
  }
});
