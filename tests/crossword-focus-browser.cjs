// Keyboard traversal and active-cell focus on the shared crossword board.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18775';
const out = process.env.SCREENSHOT_DIR || '/tmp/crossword-focus/after';
fs.mkdirSync(out, { recursive: true });
const routes = [
  ['crossword-nyt', '2026-10-02', '2026-10-03'],
  ['crossword-nytmini', '2026-10-02', '2026-10-03'],
  ['crossword-seattle', '260322', '260321'],
];
async function capture(page, name) {
  const { width, height } = page.viewportSize();
  // Bounded viewport crops, including the complete board, not huge full-page images.
  await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled',
    clip: { x: 0, y: 0, width: Math.min(width, 1600), height } });
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    const target = ['crossword-grid', 'xw-mobile-input'].includes(active.id)
      ? document.querySelector('.xw-cell.selected') : active;
    const { x, y, width, height } = target.getBoundingClientRect();
    return { x, y, width, height, scrollX, scrollY };
  });
  fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(focus));
  const x = Math.max(0, focus.x - 10), y = Math.max(0, focus.y - 10);
  await page.screenshot({ path: `${out}/${name}-focus.png`, animations: 'disabled',
    clip: { x: x + focus.scrollX, y: y + focus.scrollY,
      width: Math.min(width - x, focus.width + 20), height: Math.min(height - y, focus.height + 20) } });
}
async function enterBoard(page) {
  await page.evaluate(() => {
    const grid = document.getElementById('crossword-grid');
    const stops = [...document.querySelectorAll('a,button,input,select,[tabindex]')]
      .filter(e => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);
    stops[stops.indexOf(grid) - 1].focus();
  });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'crossword-grid', 'board remains a native Tab target');
}
async function assertBoardFocus(page) {
  assert.equal(await page.locator('.xw-cell.selected').count(), 1);
  assert(await page.locator('.xw-cell.word-highlight').count() > 0, 'active word remains highlighted');
  assert(await page.evaluate(() => {
    const grid = document.getElementById('crossword-grid');
    const cell = grid.querySelector('.selected');
    const style = getComputedStyle(cell);
    const rect = cell.getBoundingClientRect();
    return getComputedStyle(grid).outlineStyle === 'none' &&
      style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 2 &&
      parseFloat(style.outlineOffset) < 0 && rect.width > 0 && rect.height > 0;
  }), 'keyboard focus belongs visibly inside the active cell, never around the board');
}
const wordIndex = page => page.evaluate(() => getFullWordList().findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  try {
    for (const [route, initialId, otherId] of routes) {
      const page = await browser.newPage({ reducedMotion: 'reduce', serviceWorkers: 'block' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://nyt-crossword-proxy.*/**', r => r.fulfill({ status: 200, body: '' }));
      await page.goto(`${base}/${route}/?puzzle=${initialId}`);
      await page.waitForSelector('#puzzle-layout:not(.hidden)');
      for (const [width, height] of [[1920, 1080], [1024, 768], [390, 844]]) {
        await page.setViewportSize({ width, height });
        for (const theme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme: theme });
          await page.evaluate(() => PuzzleTheme.setPreference('system'));
          const name = `${route}-${width}-${theme}`;
          await enterBoard(page);
          await capture(page, name);
          await assertBoardFocus(page);
          const before = await wordIndex(page);
          const count = await page.evaluate(() => getFullWordList().length);
          await page.keyboard.press('Tab');
          assert.equal(await wordIndex(page), (before + 1) % count, 'Tab advances exactly one clue');
          await assertBoardFocus(page);
          await page.keyboard.press('Shift+Tab');
          assert.equal(await wordIndex(page), before, 'Shift+Tab returns exactly one clue');
          await assertBoardFocus(page);
          // Reverse native traversal wraps through browser chrome because the board
          // is the final tab stop, rather than removing its needed tabindex.
          await page.locator('.back-link').first().focus();
          for (let i = 0; i < 3 && await page.evaluate(() => document.activeElement.id !== 'crossword-grid'); i++) {
            await page.keyboard.press('Shift+Tab');
          }
          assert.equal(await page.evaluate(() => document.activeElement.id), 'crossword-grid');
          await assertBoardFocus(page);
          await capture(page, `${name}-reverse`);

          // A real cell click must still place text in the board, not an old control.
          await page.locator('.xw-cell:not(.black):not(.void)').first().click();
          assert.equal(await page.evaluate(() => document.activeElement.id), 'crossword-grid');
          const cell = await page.evaluate(() => [state.selRow, state.selCol]);
          await page.keyboard.press('q');
          assert.equal(await page.evaluate(([r, c]) => state.userGrid[r][c], cell), 'Q');
          await page.keyboard.press('Backspace');
          assert.equal(await page.evaluate(([r, c]) => state.userGrid[r][c], cell), '');
          await page.keyboard.press('ArrowRight');
          await assertBoardFocus(page);
          await capture(page, `${name}-click-arrow`);

          // Visible native controls retain their keyboard ring and activation.
          await page.locator('.site-theme-select').focus();
          await page.keyboard.press('Tab');
          if (await page.locator('#btn-timer-toggle').isVisible()) await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-timer-pause');
          assert(await page.locator('#btn-timer-pause').evaluate(e => e.matches(':focus-visible') && getComputedStyle(e).outlineStyle !== 'none'));
          const paused = await page.evaluate(() => state.timerPaused);
          await page.keyboard.press('Enter');
          assert.notEqual(await page.evaluate(() => state.timerPaused), paused, 'native Enter still activates buttons');
          await page.keyboard.press('Enter');
          await capture(page, `${name}-control`);
          assert.equal(await page.locator('.selected').evaluate(e => getComputedStyle(e).outlineStyle), 'none', 'cell focus ring clears when a control owns focus');
          await page.locator('.site-theme-select').focus();
          const puzzleControl = route === 'crossword-seattle' ? '#puzzle-select' : '#puzzle-date';
          // Traverse mobile Tools and the native date calendar's internal stop.
          for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Shift+Tab');
            if (await page.locator(puzzleControl).evaluate(e => document.activeElement === e && e.matches(':focus-visible'))) break;
          }
          assert(await page.locator(puzzleControl).evaluate(e => document.activeElement === e && e.matches(':focus-visible') && getComputedStyle(e).outlineStyle !== 'none'), 'date inputs and puzzle selects retain native keyboard focus');
          await capture(page, `${name}-input-control`);

          const currentId = await page.evaluate(() => state.puzzleId);
          const nextId = currentId === initialId ? otherId : initialId;
          // Both the date input and dropdown exercise actual puzzle replacement.
          if (route !== 'crossword-seattle' && theme === 'dark') {
            await page.locator('#puzzle-date').fill(nextId);
            await page.keyboard.press('Tab');
          } else {
            await page.locator('#puzzle-select').selectOption(nextId);
          }
          await page.waitForFunction(id => state.puzzleId === id && !document.getElementById('puzzle-layout').classList.contains('hidden'), nextId);
          await enterBoard(page);
          await assertBoardFocus(page);
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await assertBoardFocus(page);
          await capture(page, `${name}-switched`);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
      // Touch uses an invisible native input, so its visible focus belongs on
      // the selected cell too. This is browser emulation, not an OS keyboard test.
      const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
      await touch.route('https://nyt-crossword-proxy.*/**', r => r.fulfill({ status: 200, body: '' }));
      await touch.goto(`${base}/${route}/?puzzle=${initialId}`);
      await touch.waitForSelector('#puzzle-layout:not(.hidden)');
      for (const theme of ['light', 'dark']) {
        await touch.emulateMedia({ colorScheme: theme });
        await touch.evaluate(() => PuzzleTheme.setPreference('system'));
        await touch.locator('.xw-cell:not(.black):not(.void)').first().tap();
        assert.equal(await touch.evaluate(() => document.activeElement.id), 'xw-mobile-input');
        await touch.keyboard.press('Tab');
        await assertBoardFocus(touch);
        await touch.keyboard.press('Shift+Tab');
        await assertBoardFocus(touch);
        await capture(touch, `${route}-390-${theme}-native-input`);
      }
      await touch.close();
      console.log(`PASS ${route}: Tab/reverse/click/typing/arrows/control focus/puzzle switches, three widths, both themes, native input focus`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
