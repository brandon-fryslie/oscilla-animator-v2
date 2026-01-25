import { pass1TypeConstraints } from './src/compiler/passes-v2/pass1-type-constraints';
import { normalize } from './src/graph/normalize';
import { buildPatch } from './src/graph/Patch';
import { patchGoldenSpiral } from './src/demo/golden-spiral';

const patch = buildPatch(patchGoldenSpiral);
const normalized = normalize(patch);
console.log('Normalized blocks:', normalized.blocks.length);

// Find Broadcast blocks
for (let i = 0; i < normalized.blocks.length; i++) {
  const b = normalized.blocks[i];
  if (b.type === 'Broadcast') {
    console.log('Broadcast block at index', i, 'id:', b.id);
  }
}

const result = pass1TypeConstraints(normalized);
if (result.kind === 'error') {
  console.log('Pass1 errors:');
  for (const e of result.errors) {
    console.log('  ' + e.kind + ': ' + e.message);
  }
} else {
  console.log('Pass1 OK, portTypes count:', result.portTypes.size);
  for (const [key, type] of result.portTypes) {
    // Show Broadcast-related ports
    const blockIdx = parseInt(key.split(':')[0]);
    const block = normalized.blocks[blockIdx];
    if (block && block.type === 'Broadcast') {
      console.log('  ' + key + ' (' + block.id + '): payload=' + type.payload + ', unit=' + (type.unit?.kind || type.unit));
    }
  }
}
