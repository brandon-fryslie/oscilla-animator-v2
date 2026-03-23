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

  const scatterBlocks = [];
  const samplePathBlocks = [];

  const blockRegex = /block\s+"([^"]+)"\s+"([^"]+)"\s+\{([\s\S]*?)\n  \}/g;
  
  content = content.replace(blockRegex, (match, type, name, inner) => {
    if (type === 'Array') {
      type = 'InstanceDomain';
      inner = inner.replace(/^\s*elements\s*=\s*(.+)$/gm, (m, p1) => {
          return '      index = ' + p1.replace(/\.elements/g, '.index');
      });
      inner = inner.replace(/^\s*t\s*=\s*(.+)$/gm, '      rank = $1');
    } else if (type === 'GridLayoutUV' || type === 'SpiralLayout' || type === 'CircleLayoutUV') {
      scatterBlocks.push(name);
      type = 'ScatterUV';
      // remove old inputs
      inner = inner.replace(/^\s*(rows|cols|turns|expansion|radius|spin)\s*=\s*.*$/gm, '');
      // ScatterUV doesn't take phase. Remove phase input mapping if it exists.
      // E.g., `phase = clock.phaseA`
      inner = inner.replace(/^\s*phase\s*=\s*.*$/gm, '');
      
      inner = inner.replace(/^\s*controlPoints\s*=\s*(.+)$/gm, '      uv = $1');
      inner = inner.replace(/^\s*rotation\s*=\s*.*$/gm, '');
      inner = inner.replace(/^\s*scale\s*=\s*.*$/gm, '');
    } else if (type === 'PathLayout') {
      samplePathBlocks.push(name);
      type = 'SamplePath';
      inner = inner.replace(/^\s*(closed|spacing|offset)\s*=\s*.*$/gm, '');
      
      // elements input becomes t
      // It used to look like: elements = instances.elements
      // We want: t = instances.rank
      inner = inner.replace(/^\s*elements\s*=\s*([a-zA-Z0-9_-]+)\.[a-zA-Z0-9_-]+(.*)$/gm, '      t = $1.rank$2');
      
      // shape input becomes controlPoints
      inner = inner.replace(/^\s*shape\s*=\s*(.+)$/gm, '      controlPoints = $1');

      // controlPoints output becomes position
      inner = inner.replace(/^\s*controlPoints\s*=\s*(.+)$/gm, '      position = $1');
      // rotation output becomes tangent
      inner = inner.replace(/^\s*rotation\s*=\s*(.+)$/gm, '      tangent = $1');
    }
    
    return `block "${type}" "${name}" {${inner}\n  }`;
  });

  // Global downstream replacements
  content = content.replace(/\.t([\s\],])/g, '.rank$1');
  content = content.replace(/\.elements([\s\],])/g, '.index$1');

  for (const sb of scatterBlocks) {
    // If someone referenced scatterBlock.controlPoints -> scatterBlock.uv
    const cpRegex = new RegExp(`\\b${sb}\\.controlPoints\\b`, 'g');
    content = content.replace(cpRegex, `${sb}.uv`);
    
    // Also remove the block's phase output reference from anywhere
    const phaseRegex = new RegExp(`[,\\s]*\\b${sb}\\.phase\\b`, 'g');
    content = content.replace(phaseRegex, '');
  }

  for (const pb of samplePathBlocks) {
    const cpRegex = new RegExp(`\\b${pb}\\.controlPoints\\b`, 'g');
    content = content.replace(cpRegex, `${pb}.position`);
    
    const rotRegex = new RegExp(`\\b${pb}\\.rotation\\b`, 'g');
    content = content.replace(rotRegex, `${pb}.tangent`);
    
    // Also, if someone wired TO PathLayout.shape, it should now be PathLayout.controlPoints
    // E.g., `shape = path_layout.shape` -> `controlPoints = path_layout.controlPoints`
    // Actually, `MakeShape2D` output `shape` wires TO `path_layout.shape`.
    // So `shape = path_layout.shape`
    const shapeRegex = new RegExp(`\\b${pb}\\.shape\\b`, 'g');
    content = content.replace(shapeRegex, `${pb}.controlPoints`);
  }

  // Cleanup dangling commas in arrays `[a, ]` -> `[a]`
  content = content.replace(/\[\s*,/g, '[');
  content = content.replace(/,\s*\]/g, ']');
  content = content.replace(/,\s*,/g, ',');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Migrated:', file);
  }
});
