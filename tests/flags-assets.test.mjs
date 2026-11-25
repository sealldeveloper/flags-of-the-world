import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root, 'flags/script.js'), 'utf8');
assert.doesNotMatch(source, /https?:\/\/(?:cdn\.)?countryflags\.com/i);

const references = [...source.matchAll(/url: 'assets\/flags\/([a-z0-9-]+\.png)'/g)].map((match) => match[1]);
assert.equal(references.length, 197);
assert.equal(new Set(references).size, 197);

const directory = path.join(root, 'flags/assets/flags');
const files = (await readdir(directory)).filter((name) => name.endsWith('.png')).sort();
assert.deepEqual([...references].sort(), files);
for (const filename of files) {
  const data = await readFile(path.join(directory, filename));
  assert.ok(data.length >= 500, `${filename} is unexpectedly small`);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${filename} is not a PNG`);
}

console.log(`validated ${files.length} local flag assets`);
