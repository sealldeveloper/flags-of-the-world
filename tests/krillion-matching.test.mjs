import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAnswer,createMatcher,matchAnswer,matchedOutcome,editDistance} from '../krillion/matching.mjs';
import {TIERS,validSave} from '../krillion/model.mjs';

const answer=(name,tier='rare')=>({answer:name,tier,score:TIERS[tier].score,quip:'Preserved source detail.'});
const prompt={id:'p1',text:'Fixture prompt'};
const matches=(names,raw)=>matchAnswer(createMatcher(names.map(n=>answer(n))),raw);

test('existing exact spelling, case, compatibility and whitespace matches retain precedence',()=>{
 const index=createMatcher([answer('Café'),answer('Cafe!'),answer('EXACT')]);
 assert.equal(matchAnswer(index,'  ＥＸＡＣＴ ').kind,'exact');
 assert.equal(matchAnswer(index,'café').answer.answer,'Café');
 assert.equal(matchAnswer(index,'cafe!').answer.answer,'Cafe!');
 assert.equal(matchAnswer(index,'cafe').kind,'ambiguous');
});
test('normalization handles accents, punctuation, spacing, articles and useful symbols without losing foreign names',()=>{
 assert.equal(normalizeAnswer('  The Café’s & C++ #1  '),'the cafes and c plus plus sharp 1');
 for(const [stored,raw] of [['Café','Cafe'],['C++','C plus plus'],['C#','C sharp'],['Ben & Jerry’s','Ben and Jerrys'],['The Beatles','Beatles'],['New Zealand','NewZealand'],['Москва','МОСКВА!'],['東京','東京!']]){
  const result=matches([stored],raw);assert.equal(result.kind,'normalized',stored);assert.equal(result.answer.answer,stored);
 }
 assert.equal(matches(['C++','C#'],'C').kind,'none');
 assert.equal(matches(['Москва'],'Moscow').kind,'none');
});
test('English plural variants are suggestions, not invented semantic aliases',()=>{
 for(const [stored,raw] of [['Strawberries','strawberry'],['Tomatoes','tomato'],['Foxes','fox'],['Leaves','leaf'],['Wolves','wolf'],['Dogs','dog']])assert.equal(matches([stored],raw).kind,'normalized',stored);
 assert.equal(matches(['United States'],'USA').kind,'none');
 assert.equal(matches(['United Kingdom'],'Britain').kind,'none');
});
test('local typo matching supports insertion, deletion, substitution and adjacent transposition',()=>{
 for(const raw of ['frnace','francee','frnce','fronce']){const match=matches(['France'],raw);assert.equal(match.kind,'fuzzy',raw);assert.equal(match.answer.answer,'France');}
 assert.equal(matches(['Москва'],'Москвa').kind,'fuzzy');
});
test('short names do not get fuzzy corrected and longer guesses have bounded edit budgets',()=>{
 assert.equal(matches(['Chad'],'Chda').kind,'none');
 assert.equal(matches(['France'],'frnoce').kind,'none');
 assert.equal(matches(['Argentina'],'arxentinb').kind,'fuzzy');
 assert.equal(matches(['Argentina'],'arxentin').kind,'none');
 assert.equal(matches(['123456'],'123457').kind,'none');
 assert.equal(matches(['France'],'not-a-real-archived-answer-<script>').kind,'none');
});
test('equal-distance candidates and normalized collisions are declined rather than arbitrarily scored',()=>{
 assert.equal(matches(['Ghana','Guana'],'Gaana').kind,'ambiguous');
 assert.equal(matches(['Café','Cafe!'],'Cafe').kind,'ambiguous');
 assert.equal(matches(['Peaches','Peach'],'Peachs').kind,'ambiguous');
 const best=matches(['France','Francophone'],'Frnace');assert.equal(best.kind,'fuzzy');assert.equal(best.answer.answer,'France');
});
test('all non-exact suggestions require a matching explicit confirmation and preserve original points',()=>{
 for(const [tier,value]of Object.entries(TIERS)){
  const stored=answer('Brazil',tier),index=createMatcher([stored]);
  const pending=matchedOutcome(prompt,index,'Braizl');assert.equal(pending.score,0);assert.equal(pending.tier,null);assert.equal(pending.suggestion,'Brazil');
  assert.equal(matchedOutcome(prompt,index,'Braizl',{confirmation:'France'}).score,0);
  const confirmed=matchedOutcome(prompt,index,'Braizl',{confirmation:'Brazil'});assert.equal(confirmed.score,value.score);assert.equal(confirmed.tier,tier);assert.equal(confirmed.answer,'Brazil');assert.equal(confirmed.rawAnswer,'Braizl');assert.equal(confirmed.quip,stored.quip);
 }
 const normalized=createMatcher([answer('Café')]);assert.equal(matchedOutcome(prompt,normalized,'cafe').score,0);assert.equal(matchedOutcome(prompt,normalized,'cafe',{confirmation:'Café'}).score,60);
});
test('autocorrect off and expiry exact-only checks never award an unconfirmed suggestion',()=>{
 const index=createMatcher([answer('Brazil','krillion')]);
 assert.equal(matchedOutcome(prompt,index,'Braizl',{exactOnly:true,confirmation:'Brazil'}).score,0);
 assert.equal(matchedOutcome(prompt,index,'BRAZIL',{exactOnly:true}).score,100);
 assert.equal(matchedOutcome(prompt,index,'',{}).score,0);
});
test('pending confirmations fit version-one saves without breaking existing saved games',()=>{
 const puzzle={date:'2026-11-02',prompts:[prompt]},state={version:1,date:puzzle.date,phase:'answering',round:0,results:[],draft:'Braizl',endsAt:Date.now()+25000};
 assert(validSave(state,puzzle));assert(validSave({...state,correction:{raw:'Braizl',answer:'Brazil'}},puzzle));
 assert(!validSave({...state,correction:{raw:'changed',answer:'Brazil'}},puzzle));
 assert(!validSave({...state,correction:{raw:'Braizl',answer:''}},puzzle));
 assert(!validSave({...state,phase:'intro',correction:{raw:'Braizl',answer:'Brazil'}},puzzle));
});
test('bounded distance agrees with a full reference implementation, including transpositions',()=>{
 function reference(a,b){const rows=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)rows[i][0]=i;for(let j=0;j<=b.length;j++)rows[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1);}return rows[a.length][b.length];}
 const words=[''];let level=[''];for(let n=0;n<3;n++){level=level.flatMap(word=>['a','b','c'].map(letter=>word+letter));words.push(...level);}for(const a of words)for(const b of words)for(let maximum=0;maximum<=2;maximum++)assert.equal(editDistance(a,b,maximum),Math.min(reference(a,b),maximum+1),`${a}/${b}/${maximum}`);
 assert.equal(editDistance('Мосвка','Москва',1),1);
 assert.throws(()=>editDistance('a','b',3));
});
