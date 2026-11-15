import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {GAMES} from '../assets/daily.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('home and shared daily catalogue omit Krillion and retain every other listing', () => {
  const home = read('index.html');
  assert.doesNotMatch(home, /krillion/i);
  assert.deepEqual([...home.matchAll(/class="card" href="([^"]+)"/g)].map(match => match[1]), [
    '/crossword-nyt/', '/crossword-nytmini/', '/connections-nyt/', '/flags/', '/tld/',
    '/tierlist/', '/uno/', '/jeopardy/', '/scattegories/local/', '/deadlock-guess-who/', '/crossword-seattle/',
  ]);
  // This catalogue drives automatic daily downloads and the finished/download counts.
  assert.deepEqual(GAMES.map(game => game.path), ['/crossword-nyt/', '/crossword-nytmini/', '/connections-nyt/']);
});

test('Krillion archive workflow is manual-only; other games retain their daily fetch', () => {
  const archive = read('.github/workflows/archive-krillion.yml');
  assert.match(archive, /\non:\n  workflow_dispatch:\s*\n\npermissions:/);
  assert.doesNotMatch(archive, /^\s*(schedule|cron|workflow_call|workflow_run|push):/m);
  assert.match(archive, /run: node krillion\/archive\.mjs/);
  const fetch = read('.github/workflows/fetch-puzzles.yml');
  assert.match(fetch, /schedule:\n\s+- cron: '0 9 \* \* \*'/);
  assert.doesNotMatch(fetch, /krillion/i);
  for (const game of ['Seattle Times', 'NYT Daily', 'NYT Mini', 'NYT Connections']) {
    assert(fetch.includes(`- name: Fetch ${game} puzzles`));
  }
  for (const file of readdirSync(new URL('../.github/workflows/', import.meta.url))) {
    if (file === 'archive-krillion.yml') continue;
    assert.doesNotMatch(read('.github/workflows/' + file), /krillion/i, file + ' must not automatically invoke Krillion');
  }
});

test('direct Krillion player, all archived days, answer banks and offline artwork remain', () => {
  assert.match(read('krillion/index.html'), /<title>Krillion archive/);
  for (const file of ['ui.mjs', 'reader.mjs', 'answer-worker.mjs', 'style.css', 'motion.css']) {
    assert(read('krillion/' + file).length > 0);
  }
  const manifest = JSON.parse(read('krillion/puzzles/manifest.json'));
  assert(manifest.puzzles.some(puzzle => puzzle.date === '2026-11-02'));
  for (const entry of manifest.puzzles) {
    const puzzle = JSON.parse(read('krillion/puzzles/' + entry.file));
    assert.equal(puzzle.date, entry.date);
    assert.equal(puzzle.prompts.length, 7);
    for (const prompt of puzzle.prompts) {
      assert(readFileSync(new URL('../krillion/puzzles/' + prompt.bank, import.meta.url)).length > 0);
    }
  }
  for (const file of JSON.parse(read('krillion/assets/offline.json'))) {
    assert(readFileSync(new URL('../krillion/assets/' + file, import.meta.url)).length > 0);
  }
});
