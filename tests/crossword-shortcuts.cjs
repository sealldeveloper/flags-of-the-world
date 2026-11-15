// Native Chromium keyboard regression, using only committed crossword archives.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18776';
const routes = [
  ['crossword-nyt', '2026-10-02', '2026-10-01'],
  ['crossword-nytmini', '2026-10-02', '2026-10-01'],
  ['crossword-seattle', '260322', '260321'],
];
const grid = p => p.evaluate(() => JSON.stringify(state.userGrid));
const selection = p => p.evaluate(() => [state.selRow, state.selCol, state.direction]);
const index = p => p.evaluate(() => getFullWordList().findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction));
async function ready(p, id) {
  await p.waitForFunction(id => state.puzzleId === id && !dom.puzzleLayout.classList.contains('hidden'), id);
}
// Deliberately separate Shift down, letter down/up and Shift up, including repeats.
async function shifted(p, key, repeats = 1) {
  await p.keyboard.down('Shift');
  try { for (let i = 0; i < repeats; i++) await p.keyboard.press(key); }
  finally { await p.keyboard.up('Shift'); }
}
async function seed(p, kind) {
  await p.evaluate(kind => {
    for (const field of ['userGrid', 'locked', 'incorrect', 'revealed']) state[field].forEach(row => row.fill(field === 'userGrid' ? '' : false));
    state.lockMode = kind !== 'word'; state.rebusMode = false; state.overtype = true;
    state.history = []; state.future = [];
    for (const {r,c} of getCurrentWordCells()) {
      state.userGrid[r][c] = kind === 'partial' || kind === 'wrong' ? (state.solution[r][c] === 'Z' ? 'A' : 'Z') : state.solution[r][c];
    }
    dom.activeClueBar.classList.remove('flash-correct', 'flash-wrong-bar');
    updateAllCellVisuals();
    window.shortcutEvents = [];
  }, kind);
}
async function checkActions(p, label) {
  for (const [kind, key] of [['word','KeyW'], ['wrong','KeyW'], ['all','KeyC'], ['partial','KeyP']]) {
    await seed(p, kind);
    const before = await grid(p), sel = await selection(p);
    await shifted(p, key, kind === 'word' ? 2 : 1);
    const events = await p.evaluate(() => shortcutEvents);
    assert.equal(await grid(p), before, `${label} ${key}: must not insert shortcut letter; events=${JSON.stringify(events)}`);
    assert.deepEqual(await selection(p), sel, `${label} ${key}: must not move selection`);
    const downs = events.filter(e => e.type === 'keydown' && e.code === key);
    assert.equal(downs.length, kind === 'word' ? 2 : 1);
    assert(downs.every(e => e.trusted && e.shift && e.prevented), `${label}: trusted Shift keydown must be consumed`);
    assert(!events.some(e => e.type === 'beforeinput' || e.type === 'input'), `${label}: shortcut must suppress native text insertion`);
    if (kind === 'word' || kind === 'wrong') {
      assert(await p.locator(`#active-clue-bar.${kind === 'word' ? 'flash-correct' : 'flash-wrong-bar'}`).count(), `${label}: check-word feedback`);
    } else if (kind === 'all') {
      assert(await p.evaluate(() => getCurrentWordCells().every(({r,c}) => state.locked[r][c])));
      assert(await p.locator('.xw-cell.correct-locked').count(), `${label}: check-all locks correct word`);
    } else {
      assert(await p.evaluate(() => getCurrentWordCells().every(({r,c}) => state.incorrect[r][c])));
      assert(await p.locator('.xw-cell.incorrect').count(), `${label}: partial-check marks wrong letters`);
    }
  }
  // An incomplete word has no feedback, but must still consume the shortcut.
  await p.evaluate(() => { state.userGrid.forEach(row => row.fill('')); });
  await shifted(p, 'KeyW');
  assert.equal(await p.evaluate(() => state.userGrid.flat().filter(Boolean).length), 0, `${label}: incomplete check must not type W`);
}
async function focus(p, mode) {
  switch (mode) {
    case 'pointer': await p.locator('.xw-cell:not(.black)').first().click(); break;
    case 'tab':
      await p.evaluate(() => {
        const stops = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(el => el.tabIndex >= 0 && el.getClientRects().length && !el.disabled);
        stops[stops.indexOf(dom.grid) - 1].focus();
      });
      await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(() => document.activeElement.id), 'crossword-grid');
      break;
    case 'across': case 'down': await p.locator(`#${mode}-list .clue-item`).first().click(); break;
    case 'settings':
      await p.locator('#chk-overtype').click();
      // Settings retain native focus until the player returns to gameplay.
      await p.locator('.xw-cell:not(.black)').first().click(); break;
    case 'dialog':
      await p.evaluate(() => showModal('i', 'Shortcut regression', 'Close then return to the board.'));
      await p.locator('#modal-close').click();
      await p.locator('#across-list .clue-item').first().click(); break;
    case 'native': await p.locator('#xw-mobile-input').focus(); break;
  }
}
async function nonShortcutInput(p) {
  await p.evaluate(() => {
    state.userGrid.forEach(row => row.fill('')); state.locked.forEach(row => row.fill(false));
    state.lockMode = false; state.overtype = true;
    jumpToWord(getFullWordList().find(w => (w.dir === 'across' ? state.acrossMap : state.downMap)[w.num].length >= 4));
  });
  const letters = () => p.evaluate(() => getCurrentWordCells().map(({r,c}) => state.userGrid[r][c]));
  await p.keyboard.press('w'); await p.keyboard.press('W'); await shifted(p, 'KeyA');
  assert.deepEqual((await letters()).slice(0,4), ['W','W','A','']);
  await p.keyboard.press('Backspace');
  assert.deepEqual((await letters()).slice(0,4), ['W','W','','']);
  // Uppercase text from mobile autocapitalization/IME is not a Shift shortcut.
  await p.evaluate(() => { state.userGrid.forEach(row => row.fill('')); jumpToWord(getFullWordList()[0]); });
  await p.locator('#xw-mobile-input').focus();
  await p.keyboard.insertText('CPW');
  assert.deepEqual((await letters()).slice(0,3), ['C','P','W']);
  // Ctrl+Shift+Z really emits uppercase Z with native keyboard events.
  const beforeUndo = await grid(p);
  await p.keyboard.press('Control+KeyZ'); assert.notEqual(await grid(p), beforeUndo);
  await p.keyboard.down('Control'); await shifted(p, 'KeyZ'); await p.keyboard.up('Control');
  assert.equal(await grid(p), beforeUndo, 'Ctrl+Shift+Z redo');
  // Both clear-word variants preserve or remove intersection letters as documented.
  await seed(p, 'word');
  const shared = await p.evaluate(() => getCurrentWordCells().filter(({r,c}) => state.cellToAcross[cellKey(r,c)] != null && state.cellToDown[cellKey(r,c)] != null).length);
  await p.keyboard.press('Control+Backspace');
  assert.equal(await p.evaluate(() => state.userGrid.flat().filter(Boolean).length), shared);
  await p.keyboard.press('Control+Shift+Backspace');
  assert.equal(await p.evaluate(() => state.userGrid.flat().filter(Boolean).length), 0);
  await p.evaluate(() => jumpToWord(getFullWordList()[1]));
  let before = await index(p);
  await p.keyboard.press('Tab'); assert.equal(await index(p), before + 1);
  await shifted(p, 'Tab'); assert.equal(await index(p), before);
  await p.keyboard.press('Enter'); assert.equal(await index(p), before + 1);
  await shifted(p, 'Enter'); assert.equal(await index(p), before);
  const sel = await selection(p);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft');
  assert.deepEqual(await selection(p), sel);
  await p.keyboard.press('Space'); assert.notEqual((await selection(p))[2], sel[2]);
  // Shift+lowercase key is possible with Caps Lock/layouts; match the letter, not casing.
  await seed(p, 'word'); const unchanged = await grid(p);
  await shifted(p, 'w'); assert.equal(await grid(p), unchanged);
  assert(await p.locator('#active-clue-bar.flash-correct').count());
}
async function guardedTargets(p) {
  await seed(p, 'word'); const before = await grid(p);
  for (const selector of ['#puzzle-select','#action-select','#chk-lock','#btn-undo','a.back-link']) {
    await p.locator(selector).first().focus();
    // W natively type-selects Wednesday, so use C to avoid changing the puzzle.
    await shifted(p, selector === '#puzzle-select' ? 'KeyC' : 'KeyW');
    assert.equal(await grid(p), before, `${selector}: retain native keyboard ownership`);
    assert.equal(await p.locator('#active-clue-bar.flash-correct').count(), 0);
  }
  // Real editable controls and dialog entry must not leak into gameplay.
  await p.evaluate(() => {
    const host = document.createElement('div'); host.id = 'shortcut-editables';
    host.innerHTML = '<input><textarea></textarea><div contenteditable="true" tabindex="0"></div>';
    document.body.append(host);
  });
  for (const selector of ['input','textarea','[contenteditable]']) {
    const editor = p.locator(`#shortcut-editables ${selector}`); await editor.focus();
    await shifted(p, 'KeyW');
    assert.equal(selector === '[contenteditable]' ? await editor.textContent() : await editor.inputValue(), 'W');
    assert.equal(await grid(p), before);
  }
  await p.evaluate(() => {
    document.getElementById('shortcut-editables').remove();
    showModal('i', 'Entry', '');
    const input = document.createElement('input'); input.id = 'shortcut-dialog-entry'; dom.modalBody.append(input); input.focus();
  });
  await shifted(p, 'KeyW'); assert.equal(await p.locator('#shortcut-dialog-entry').inputValue(), 'W');
  assert.equal(await grid(p), before);
  await p.locator('#modal-close').click();
  await p.locator('.xw-cell:not(.black)').first().click();
  await seed(p, 'word');
  // Browser/OS modifier chords must not become checks or insert text.
  for (const key of ['Control+Shift+KeyW','Meta+Shift+KeyW','Alt+Shift+KeyW']) {
    await p.keyboard.press(key);
    assert.equal(await p.locator('#active-clue-bar.flash-correct').count(), 0);
  }
}
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true});
  let active;
  try {
    for (const hasTouch of [false,true]) {
      const p = active = await browser.newPage({viewport:{width:1280,height:900},hasTouch,reducedMotion:'reduce',serviceWorkers:'block'});
      const errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.route('https://nyt-crossword-proxy.*/**', r => r.fulfill({status:200,body:''}));
      await p.addInitScript(() => {
        window.shortcutEvents = [];
        for (const type of ['keydown','keyup','beforeinput','input']) window.addEventListener(type, e => shortcutEvents.push({
          type, key:e.key, code:e.code, shift:e.shiftKey, ctrl:e.ctrlKey, alt:e.altKey, meta:e.metaKey,
          trusted:e.isTrusted, target:e.target.id, prevented:e.defaultPrevented, data:e.data,
        }));
      });
      // Re-enter all routes twice in one profile, including the launcher and archive link.
      for (let pass = 0; pass < 2; pass++) for (const [route,first,second] of routes) {
        await p.goto(`${base}/crossword/`);
        assert.equal(await p.locator(`a[href="/${route}/"]`).count(), 1);
        await p.goto(`${base}/${route}/?puzzle=${first}`); await ready(p, first);
        for (const mode of ['pointer','tab','across','down','settings','dialog','native']) {
          await focus(p, mode); await checkActions(p, `${route} touch=${hasTouch} pass=${pass} focus=${mode}`);
        }
        for (const id of [second,first,second]) {
          if (route !== 'crossword-seattle') {
            await p.locator('#puzzle-date').fill(id); await p.locator('#puzzle-date').press('Tab');
          } else await p.selectOption('#puzzle-select', id);
          await ready(p, id);
          await focus(p, 'pointer'); await checkActions(p, `${route} switched=${id}`);
        }
        await nonShortcutInput(p); await guardedTargets(p);
        // Hold a real local archive response while keys arrive; no stale grid edits.
        const path = route === 'crossword-seattle' ? `**/${route}/puzzles/2026/03/260322.txt` : `**/${route}/puzzles/2026/10/2026-10-02.json`;
        await p.evaluate(async () => { await caches.delete('puzzle-daily-data-v1'); });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const handler = async r => { await gate; await r.continue(); };
        await p.route(path, handler);
        const requested = p.waitForRequest(path);
        await p.selectOption('#puzzle-select', first); await requested;
        await p.waitForSelector('#puzzle-layout.hidden', {state:'attached'});
        const loadingGrid = await grid(p);
        await shifted(p, 'KeyW'); assert.equal(await grid(p), loadingGrid);
        release(); await ready(p, first); await p.unroute(path, handler);
        await focus(p, 'pointer'); await checkActions(p, `${route} delayed load`);
        // A modifier held across puzzle switching/focus changes is read from the
        // letter event, not a remembered keydown/keyup state tied to the old grid.
        await p.keyboard.down('Shift');
        try {
          await p.selectOption('#puzzle-select', second); await ready(p, second);
          await focus(p, 'pointer'); await seed(p, 'word');
          const before = await grid(p);
          await p.keyboard.press('KeyW'); assert.equal(await grid(p), before);
          assert(await p.locator('#active-clue-bar.flash-correct').count());
        } finally { await p.keyboard.up('Shift'); }
        if (route === 'crossword-seattle') {
          await p.getByRole('link', {name:'archive',exact:true}).click();
          await p.locator(`a[href="/crossword-seattle/?puzzle=${second}"]`).click();
          await ready(p, second); await focus(p, 'pointer'); await checkActions(p, `${route} archive`);
        }
        console.log(`PASS ${route} touch=${hasTouch} pass=${pass}: native Shift actions, focus, date/archive switches, delayed load, input and guards`);
      }
      assert.deepEqual(errors, []); await p.close(); active = null;
    }
  } catch (e) {
    if (active && !active.isClosed()) console.error('Native event evidence:', JSON.stringify(await active.evaluate(() => shortcutEvents)));
    throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
