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

  // Fix `something = \n`
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*=\s*$/gm, '');

  // Fix `something \n` where it's dangling (not a block, not an open brace, not a close brace)
  // Careful not to delete `outputs {` or `}` or `block "..." "..." {`
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*$/gm, '');

  // Remove empty outputs blocks
  content = content.replace(/^\s*outputs\s*\{\s*\}\s*$/gm, '');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed syntax:', file);
  }
});
