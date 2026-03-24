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

  // Replace remaining `.t` usages downstream (like in expressions)
  content = content.replace(/\.t(\s|\)|\]|,|$)/g, '.rank$1');

  // Any remaining `.elements` usages that shouldn't be there 
  // (We already replaced elements = Array.elements with index = Array.index)
  // Let's replace any `elements` being wired from an Array/InstanceDomain to index
  content = content.replace(/\.elements(\s|\)|\]|,|$)/g, '.index$1');

  // Replace layout.controlPoints usages in expressions
  // Since we don't know the exact name of the layout block, we look for `.controlPoints`
  // and manually check if it was outputting uv.
  // Actually, we can use regex to find all blocks of type ScatterUV, get their names,
  // and replace `name.controlPoints` with `name.uv` throughout the file.
  
  const blockRegex = /block\s+"ScatterUV"\s+"([^"]+)"/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const blockName = match[1];
    const cpRegex = new RegExp(`\\b${blockName}\\.controlPoints\\b`, 'g');
    content = content.replace(cpRegex, `${blockName}.uv`);
  }

  // Handle PathLayout -> SamplePath migration
  const pathRegex = /block\s+"PathLayout"\s+"([^"]+)"\s+\{([\s\S]*?)\n  \}/g;
  content = content.replace(pathRegex, (m, name, inner) => {
    // PathLayout used elements. We remove elements = ... because SamplePath doesn't take elements.
    // Instead SamplePath takes 't' which we can wire to rank.
    let newInner = inner.replace(/^\s*closed\s*=\s*.*$/gm, '');
    newInner = newInner.replace(/^\s*elements\s*=\s*([a-zA-Z0-9_-]+)\.[a-zA-Z0-9_-]+\s*$/gm, '      t = $1.rank');
    // Change outputs: controlPoints -> position, rotation -> tangent
    newInner = newInner.replace(/^\s*controlPoints\s*=\s*(.+)$/gm, '      position = $1');
    newInner = newInner.replace(/^\s*rotation\s*=\s*(.+)$/gm, '      tangent = $1');
    
    return `block "SamplePath" "${name}" {${newInner}\n  }`;
  });

  // Now replace `path_layout.controlPoints` with `path_layout.position` if applicable
  const samplePathRegex = /block\s+"SamplePath"\s+"([^"]+)"/g;
  while ((match = samplePathRegex.exec(content)) !== null) {
    const blockName = match[1];
    const cpRegex = new RegExp(`\\b${blockName}\\.controlPoints\\b`, 'g');
    content = content.replace(cpRegex, `${blockName}.position`);
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Migrated:', file);
  }
});
