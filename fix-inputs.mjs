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

  // We want to find ALL layout blocks (ScatterUV and SamplePath) 
  // and completely scrub any dynamic assignments to their legacy ports from other blocks.

  const blockRegex = /block\s+"([^"]+)"\s+"([^"]+)"/g;
  let match;
  const scatterBlocks = new Set();
  const samplePathBlocks = new Set();

  while ((match = blockRegex.exec(content)) !== null) {
    if (match[1] === 'ScatterUV') scatterBlocks.add(match[2]);
    if (match[1] === 'SamplePath') samplePathBlocks.add(match[2]);
  }

  // Remove downstream outputs wiring into ScatterUV's deleted ports
  for (const sb of scatterBlocks) {
    content = content.replace(new RegExp(`[,\\s]*\\b${sb}\\.turns\\b`, 'g'), '');
    content = content.replace(new RegExp(`[,\\s]*\\b${sb}\\.expansion\\b`, 'g'), '');
    content = content.replace(new RegExp(`[,\\s]*\\b${sb}\\.spin\\b`, 'g'), '');
    content = content.replace(new RegExp(`[,\\s]*\\b${sb}\\.radius\\b`, 'g'), '');
    content = content.replace(new RegExp(`[,\\s]*\\b${sb}\\.phase\\b`, 'g'), '');
  }

  // Remove downstream outputs wiring into SamplePath's deleted ports
  for (const pb of samplePathBlocks) {
    content = content.replace(new RegExp(`[,\\s]*\\b${pb}\\.index\\b`, 'g'), '');
    content = content.replace(new RegExp(`[,\\s]*\\b${pb}\\.offset\\b`, 'g'), '');
    content = content.replace(new RegExp(`[,\\s]*\\b${pb}\\.shape\\b`, 'g'), '');
  }
  
  // Also globally fix `.t)` back to `.rank)` which my previous script failed to catch if it had other chars
  // Actually, I did `.t([\s\],])`, but wait, what about `.t` at the end of a line without spaces? `$` matches that.
  content = content.replace(/\.t(\s|\)|\]|,|$)/g, '.rank$1');

  // Fix `something = \n`
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*=\s*$/gm, '');
  content = content.replace(/^\s*[a-zA-Z0-9_-]+\s*$/gm, '');
  content = content.replace(/^\s*outputs\s*\{\s*\}\s*$/gm, '');

  content = content.replace(/\[\s*,/g, '[');
  content = content.replace(/,\s*\]/g, ']');
  content = content.replace(/,\s*,/g, ',');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed inputs:', file);
  }
});
