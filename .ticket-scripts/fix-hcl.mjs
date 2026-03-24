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

  // Remove spacing, offset, shape from SamplePath 
  const samplePathRegex = /block\s+"SamplePath"\s+"([^"]+)"\s+\{([\s\S]*?)\n  \}/g;
  content = content.replace(samplePathRegex, (m, name, inner) => {
    let newInner = inner.replace(/^\s*spacing\s*=\s*.*$/gm, '');
    newInner = newInner.replace(/^\s*offset\s*=\s*.*$/gm, '');
    
    // We also need to wire the inputs. PathLayout used `shape = ...`. SamplePath expects `controlPoints = ...`.
    // Wait, the error is `Unknown input port type: block[xx].shape`.
    // This means there's a wire pointing to `sample_path.shape`. We need to change that to `sample_path.controlPoints`
    return `block "SamplePath" "${name}" {${newInner}\n  }`;
  });

  // Globally replace any `.shape` targeting a SamplePath block to `.controlPoints`
  // Actually, let's just globally replace `.shape` with `.controlPoints` ONLY if it's the receiver side of a wire 
  // Wait, `MakeShape2D` has output `shape` that goes into `InstanceDomain.element`.
  // `MakeShape2D` -> `PathLayout.shape` used to be a wire.
  content = content.replace(/\.shape(\s|\)|\]|,|$)/g, (match, p1, offset, string) => {
    // If it's `instances.shape`, wait, InstanceDomain is `instances.element`.
    // If it was `path_layout.shape`, it should be `path_layout.controlPoints`.
    return match; // Too risky
  });

  const pathBlocks = [];
  let m;
  const pbRegex = /block\s+"SamplePath"\s+"([^"]+)"/g;
  while ((m = pbRegex.exec(content)) !== null) {
    pathBlocks.push(m[1]);
  }

  for (const pb of pathBlocks) {
    // Replace something = pb.shape with something = pb.controlPoints
    // Wait, it's the destination, so `out = pb.shape` where out is the source, and pb is the destination.
    const destRegex = new RegExp(`\\b${pb}\\.shape\\b`, 'g');
    content = content.replace(destRegex, `${pb}.controlPoints`);
    
    // PathLayout used to have `.index` and `.offset` as inputs. SamplePath has `.t`.
    const indexRegex = new RegExp(`\\b${pb}\\.index\\b`, 'g');
    content = content.replace(indexRegex, `${pb}.t`);
    const offsetRegex = new RegExp(`\\b${pb}\\.offset\\b`, 'g');
    content = content.replace(offsetRegex, `${pb}.t`);
    const elementsRegex = new RegExp(`\\b${pb}\\.elements\\b`, 'g');
    content = content.replace(elementsRegex, `${pb}.t`);
  }

  // Find all ScatterUV blocks and remove their phase, expansion, turns inputs
  const scatterBlocks = [];
  const sbRegex = /block\s+"ScatterUV"\s+"([^"]+)"/g;
  while ((m = sbRegex.exec(content)) !== null) {
    scatterBlocks.push(m[1]);
  }

  for (const sb of scatterBlocks) {
    const phaseRegex = new RegExp(`\\b${sb}\\.phase\\b(,|\\s*\\])?`, 'g');
    content = content.replace(phaseRegex, '');
    const expRegex = new RegExp(`\\b${sb}\\.expansion\\b(,|\\s*\\])?`, 'g');
    content = content.replace(expRegex, '');
    const turnRegex = new RegExp(`\\b${sb}\\.turns\\b(,|\\s*\\])?`, 'g');
    content = content.replace(turnRegex, '');
    const spinRegex = new RegExp(`\\b${sb}\\.spin\\b(,|\\s*\\])?`, 'g');
    content = content.replace(spinRegex, '');
  }

  // Clean up empty brackets or dangling commas from array replacements
  content = content.replace(/\[\s*,/g, '[');
  content = content.replace(/,\s*\]/g, ']');
  content = content.replace(/,\s*,/g, ',');
  content = content.replace(/\[\s*\]/g, ''); // empty arrays
  content = content.replace(/=\s*$/gm, ''); // dangling equals

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed:', file);
  }
});
