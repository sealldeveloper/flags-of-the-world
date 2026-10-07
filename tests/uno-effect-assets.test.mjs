import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('the original action font supports every rendered symbol and matches its provenance',()=>{
 const bytes=readFileSync(new URL('../uno/assets/scuffeduno/Rubik_Bold.json',import.meta.url)),font=JSON.parse(bytes);
 const provenance=JSON.parse(readFileSync(new URL('../uno/assets/scuffeduno/animation-provenance.json',import.meta.url)));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.font.sha256);
 for(const c of 'UNO+2470')assert(font.glyphs[c],`missing glyph ${c}`);
 const effects=readFileSync(new URL('../uno/effects.mjs',import.meta.url),'utf8');assert(!effects.includes("uno:'UNO!'"));
});
