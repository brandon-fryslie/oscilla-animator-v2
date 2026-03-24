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

  const blockRegex = /block\s+"([^"]+)"\s+"([^"]+)"\s+\{([\s\S]*?)\n  \}/g;
  
  content = content.replace(blockRegex, (match, type, name, inner) => {
    if (type === 'Array') {
      type = 'InstanceDomain';
      inner = inner.replace(/^\s*elements\s*=\s*(.+)$/gm, (m, p1) => {
          return '      index = ' + p1.replace(/\.elements/g, '.index');
      });
      inner = inner.replace(/^\s*t\s*=\s*(.+)$/gm, '      rank = $1');
    } else if (type === 'GridLayoutUV' || type === 'SpiralLayout' || type === 'CircleLayoutUV') {
      type = 'ScatterUV';
      inner = inner.replace(/^\s*(rows|cols|turns|expansion|radius|spin)\s*=\s*.*$/gm, '');
      inner = inner.replace(/^\s*controlPoints\s*=\s*(.+)$/gm, '      uv = $1');
      inner = inner.replace(/^\s*rotation\s*=\s*.*$/gm, '');
      inner = inner.replace(/^\s*scale\s*=\s*.*$/gm, '');
    }
    
    return `block "${type}" "${name}" {${inner}\n  }`;
  });

  content = content.replace(/\.t([\s\],])/g, '.rank$1');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Migrated:', file);
  }
});
