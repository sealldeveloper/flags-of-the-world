// Run with a local static server and Playwright installed:
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome node tests/puzzle-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18763';
const out = process.env.SCREENSHOT_DIR || '/tmp/puzzle-visual';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // All puzzles are local archives; don't depend on the remote Seattle list service.
  await page.route('https://nyt-crossword-proxy.*/**', route => route.fulfill({ status: 200, body: '' }));
  const routes = [['crossword-nyt', '?puzzle=2026-10-02'], ['crossword-nytmini', '?puzzle=2026-10-02'], ['crossword-seattle', '?puzzle=260322'], ['connections-nyt', '?date=2026-10-02']];
  for (const [route, query] of routes) {
    console.log(`Testing ${route}`);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${base}/${route}/${query}`);
    const crossword = route.startsWith('crossword');
    await page.waitForSelector(crossword ? '#puzzle-layout:not(.hidden)' : '#game:not(.hidden)');
    if (crossword) {
      await page.evaluate(() => {
        jumpToWord(getFullWordList()[0]);
        // Explicit next/previous must not skip even a fully locked word.
        const w = getFullWordList()[1];
        for (const {r,c} of (w.dir === 'across' ? state.acrossMap : state.downMap)[w.num]) state.locked[r][c] = true;
      });
      for (const [key, index] of [['Enter', 1], ['Tab', 2], ['Shift+Tab', 1], ['Shift+Enter', 0]]) {
        await page.keyboard.press(key);
        assert.equal(await page.evaluate(() => getFullWordList().findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction)), index, `${route}: ${key}`);
      }
      await page.evaluate(() => document.getElementById('xw-mobile-input').focus());
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => getFullWordList().findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction)), 1, 'input event must not bubble into a second move');
      await page.evaluate(() => { state.locked = state.locked.map(row => row.map(() => false)); jumpToWord(getFullWordList()[0]); });
      await page.keyboard.press('a');
      await page.keyboard.press('Backspace');
      assert.equal(await page.evaluate(() => state.userGrid.flat().filter(Boolean).length), 0);
      await page.locator('#btn-undo').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => state.userGrid.flat().filter(Boolean).length), 1, 'focused buttons retain native Enter');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Next clue', exact: true }).click();
      await page.keyboard.press('Q');
      assert.equal(await page.locator('#xw-keyboard').count(), 0);
      assert(await page.evaluate(() => state.userGrid.flat().includes('Q')));
    } else {
      // Standard loses at four mistakes; easy continues past four and reloads.
      const wrongGuess = async index => {
        await page.evaluate(async i => {
          const categories = state.puzzle.categories;
          state.selected = new Set([categories[0].cards[i % 4].id, categories[1].cards[Math.floor(i / 4) % 4].id, categories[2].cards[0].id, categories[3].cards[0].id]);
          await submitGuess();
        }, index);
      };
      for (let i = 0; i < 4; i++) await wrongGuess(i);
      assert.equal(await page.evaluate(() => state.lost), true);
      assert(await page.locator('#continue-easy').isVisible(), 'offer continuation before answers');
      await page.locator('#reveal-answers').click();
      await page.waitForFunction(() => !state.transitioning);
      await page.locator('#result-close').click();
      await page.locator('#easy-mode').check();
      for (let i = 0; i < 6; i++) await wrongGuess(i);
      assert.equal(await page.evaluate(() => state.lost), false);
      assert.equal(await page.evaluate(() => state.guesses.length), 6);
      await page.reload();
      await page.waitForSelector('#game:not(.hidden)');
      assert.equal(await page.evaluate(() => state.easyMode && !state.lost && state.guesses.length === 6), true);
      await page.locator('#easy-mode').uncheck();
      assert.equal(await page.evaluate(() => state.lost), true, 'standard progress preserved');
      await page.locator('#easy-mode').check();
      for (let i = 0; i < 4; i++) {
        await page.evaluate(async index => {
          state.selected = new Set(state.puzzle.categories[index].cards.map(c => c.id));
          await submitGuess();
        }, i);
      }
      assert.match(await page.locator('#result-summary').textContent(), /easy mode with 6 mistakes/);
      assert.match(await page.evaluate(() => shareText()), /Easy mode/);
      await page.screenshot({ path: `${out}/connections-result.png`, fullPage: true });
      await page.locator('#result-close').click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#reset-button').click();
      assert.equal(await page.evaluate(() => state.guesses.length), 0);
      await page.locator('.word-card').first().click();
    }
    for (const [width, height] of [[1920,1080], [1024,768], [390,844], [320,740]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => applyTheme(theme), theme);
        await page.waitForTimeout(100);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow at ${width}`);
        await page.screenshot({ path: `${out}/${route}-${width}-${theme}.png`, fullPage: true });
      }
    }
    if (crossword) {
      await page.locator('#xw-tools-toggle').click();
      await page.screenshot({ path: `${out}/${route}-tools.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#xw-tools-toggle').click();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.locator('#down-list .clue-item').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${route}-scrolled.png` });
      await page.evaluate(() => showModal('i', 'Test dialog', 'Keyboard input is paused while this dialog is open.'));
      await page.screenshot({ path: `${out}/${route}-modal.png` });
      await page.locator('#modal-close').click();
      await page.evaluate(() => showError('Test fixture: puzzle service unavailable.'));
      assert.equal(await page.locator('#xw-clue-nav').isVisible(), false);
      await page.screenshot({ path: `${out}/${route}-error.png` });
      await page.evaluate(() => showLoading('Test fixture: loading puzzle…'));
      await page.screenshot({ path: `${out}/${route}-loading.png` });
    }
  }
  const touch = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  await touch.goto(`${base}/crossword-nytmini/?puzzle=2026-10-02`);
  await touch.waitForSelector('#puzzle-layout:not(.hidden)');
  await touch.locator('.xw-cell:not(.black)').first().tap();
  assert.equal(await touch.evaluate(() => document.activeElement.id), 'xw-mobile-input');
  const nextTouchWord = await touch.evaluate(() => (getFullWordList().findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction) + 1) % getFullWordList().length);
  await touch.keyboard.press('Tab');
  assert.equal(await touch.evaluate(() => getFullWordList().findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction)), nextTouchWord, 'wide tablet advances once');
  await touch.setViewportSize({ width: 390, height: 844 });
  await touch.locator('.xw-cell:not(.black)').first().tap();
  assert.equal(await touch.evaluate(() => document.activeElement.id), 'xw-mobile-input');
  await touch.close();
  assert.deepEqual(errors, []);
  console.log('PASS: crossword navigation/input, Connections modes/save/reset/win/loss, four viewport sizes and both themes.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
