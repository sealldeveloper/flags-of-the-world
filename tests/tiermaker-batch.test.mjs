import test from 'node:test';
import assert from 'node:assert/strict';
import {tiermakerUrls} from '../tierlist/tiermaker.mjs';
test('TierMaker URL batches trim blank lines, canonicalize and deduplicate sources',()=>{
 assert.deepEqual(tiermakerUrls(' https://www.tiermaker.com/create/one?source=shared\r\n\nhttps://tiermaker.com/create/two\nhttps://tiermaker.com/create/one#extra '),['https://tiermaker.com/create/one','https://tiermaker.com/create/two']);
});
test('batch validation rejects unsafe URLs before any imports and identifies the offending entry',()=>{
 for(const bad of['http://tiermaker.com/create/a','https://example.com/create/a','https://user:secret@tiermaker.com/create/a','not a URL'])assert.throws(()=>tiermakerUrls('https://tiermaker.com/create/good\n'+bad),/URL 2:/);
 assert.throws(()=>tiermakerUrls('\n '),/at least one/);
});
test('batch and individual URL budgets are bounded independently',()=>{
 assert.throws(()=>tiermakerUrls('x'.repeat(32769)),/list is too long/);
 assert.throws(()=>tiermakerUrls('https://tiermaker.com/create/'+'x'.repeat(2048)),/2,048/);
 const many=Array.from({length:100},(_,index)=>'https://tiermaker.com/create/template-'+index).join('\n');assert.equal(tiermakerUrls(many).length,100);
});
