/**
 * NYT Syndicated Crossword Puzzle Web App
 * seall.dev — vanilla JS, no frameworks
 */

'use strict';

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const BASE_URL = 'https://nyt-crossword-proxy.my-account-306.workers.dev';

// ============================================================
// STATE
// ============================================================
const state = {
  // Puzzle data
  puzzleId:    null,
  dateStr:     '',
  author:      '',
  width:       0,
  height:      0,
  solution:    [],   // 2D array [row][col] — letter/string or '#'
  circles:     [],   // 2D array [row][col] — true/false
  shaded:      [],   // 2D array [row][col] — true/false (darker background)
  hidden:      [],   // 2D array [row][col] — true/false (void/transparent cell)
  acrossClues: [],   // array of { num, clue }
  downClues:   [],   // array of { num, clue }
  cellNums:    [],   // 2D array of numbers (or null)
  acrossMap:   {},   // num -> [{r,c}, ...]
  downMap:     {},   // num -> [{r,c}, ...]
  cellToAcross:{},   // "r,c" -> clue number
  cellToDown:  {},   // "r,c" -> clue number

  // User progress
  userGrid:    [],   // 2D array of user letters ('' for empty)
  revealed:    [],   // 2D bool — cell was revealed
  locked:      [],   // 2D bool — cell is locked (correct + lock-mode)
  incorrect:   [],   // 2D bool — highlighted yellow by partial check

  // UI state
  selRow:      0,
  selCol:      0,
  direction:   'across',  // 'across' | 'down'
  lockMode:    true,
  arrowDir:    false,     // cross-axis arrows change direction
  overtype:    false,     // advance one cell at a time instead of skipping to next empty

  // Undo/redo history
  history:     [],   // array of { userGrid, revealed, locked, incorrect }
  future:      [],   // array of { userGrid, revealed, locked, incorrect }

  // Timer
  timerSec:    0,
  timerRunning:false,
  timerHidden: false,
  timerPaused: false,
  timerInterval: null,
  timerStarted: false,

  // Available puzzle list
  puzzleList:  [],   // array of id strings
  archivedIds: new Set(),  // ids available locally
};

// ============================================================
// DOM REFS
// ============================================================
const $ = id => document.getElementById(id);

const dom = {
  puzzleSelect:    $('puzzle-select'),
  puzzleTitle:     $('puzzle-title'),
  puzzleAuthor:    $('puzzle-author'),
  timerDisplay:    $('timer-display'),
  btnTimerToggle:  $('btn-timer-toggle'),
  btnTimerPause:   $('btn-timer-pause'),
  actionSelect:    $('action-select'),
  scopeSelect:     $('scope-select'),
  btnGo:           $('btn-go'),
  btnClearIncorrect: $('btn-clear-incorrect'),
  chkLock:         $('chk-lock'),
  chkArrowDir:     $('chk-arrow-dir'),
  chkOvertype:     $('chk-overtype'),
  btnExport:       $('btn-export'),
  btnImport:       $('btn-import'),
  btnUndo:         $('btn-undo'),
  loadingOverlay:  $('loading-overlay'),
  loadingMsg:      $('loading-msg'),
  errorOverlay:    $('error-overlay'),
  errorMsg:        $('error-msg'),
  btnRetry:        $('btn-retry'),
  puzzleLayout:    $('puzzle-layout'),
  activeClueBar:   $('active-clue-bar'),
  activeClueNum:   $('active-clue-num'),
  activeClueText:  $('active-clue-text'),
  activeClueLen:   $('active-clue-len'),
  grid:            $('crossword-grid'),
  acrossPanel:     $('across-panel'),
  downPanel:       $('down-panel'),
  acrossList:      $('across-list'),
  downList:        $('down-list'),
  modalOverlay:    $('modal-overlay'),
  modalIcon:       $('modal-icon'),
  modalTitle:      $('modal-title'),
  modalBody:       $('modal-body'),
  modalClose:      $('modal-close'),
  winOverlay:      $('win-overlay'),
  winTime:         $('win-time'),
  winPuzzle:       $('win-puzzle'),
  winClose:        $('win-close'),
};

// ============================================================
// UTILITY HELPERS
// ============================================================
function isBlack(r, c) {
  return state.solution[r]?.[c] === '#';
}

function isVoid(r, c) {
  return state.hidden[r]?.[c] === true;
}

function isRebus(r, c) {
  return (state.solution[r]?.[c]?.length ?? 0) > 1;
}

function inBounds(r, c) {
  return r >= 0 && r < state.height && c >= 0 && c < state.width;
}

function cellKey(r, c) { return `${r},${c}`; }

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function deepClone2D(arr) {
  return arr.map(row => [...row]);
}

function showModal(icon, title, body) {
  dom.modalIcon.textContent  = icon;
  dom.modalTitle.textContent = title;
  dom.modalBody.textContent  = body;
  dom.modalOverlay.classList.remove('hidden');
}

// ============================================================
// LOADING / ERROR UI
// ============================================================
function showLoading(msg = 'Loading puzzle...') {
  dom.loadingMsg.textContent = msg;
  dom.loadingOverlay.classList.remove('hidden');
  dom.errorOverlay.classList.add('hidden');
  dom.puzzleLayout.classList.add('hidden');
}

function showError(msg) {
  dom.errorMsg.textContent = msg;
  dom.errorOverlay.classList.remove('hidden');
  dom.loadingOverlay.classList.add('hidden');
  dom.puzzleLayout.classList.add('hidden');
}

function showPuzzle() {
  dom.loadingOverlay.classList.add('hidden');
  dom.errorOverlay.classList.add('hidden');
  dom.puzzleLayout.classList.remove('hidden');
}

// ============================================================
// FETCH HELPERS
// ============================================================
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('iso-8859-1').decode(buf);
}

// ============================================================
// PUZZLE LIST
// ============================================================
function localPuzzlePath(id) {
  const yy = id.slice(0, 2);
  const mm = id.slice(2, 4);
  return `./puzzles/20${yy}/${mm}/${id}.txt`;
}

async function loadManifest() {
  try {
    const res = await fetch('./puzzles/manifest.json');
    if (!res.ok) return [];
    return await res.json();
  } catch (_) { return []; }
}

async function loadPuzzleList() {
  const [liveRaw, archived] = await Promise.allSettled([
    fetchText(`${BASE_URL}?date=list&get=archivecurrent`),
    loadManifest(),
  ]);

  const liveIds = liveRaw.status === 'fulfilled'
    ? liveRaw.value.split('\n').map(l => l.trim()).filter(l => /^\d{6}$/.test(l))
    : [];

  const archivedIds = archived.status === 'fulfilled' ? archived.value : [];

  // Merge, dedupe, sort newest first
  const all = [...new Set([...liveIds, ...archivedIds])].sort((a, b) => b.localeCompare(a));

  state.puzzleList   = all;
  state.archivedIds  = new Set(archivedIds);
  return all;
}

function populatePuzzleSelector(ids) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  dom.puzzleSelect.innerHTML = '';

  let group = null;
  let groupKey = null;

  ids.forEach(id => {
    if (id.length !== 6) return;
    const yy = id.slice(0, 2);
    const mm = id.slice(2, 4);
    const dd = id.slice(4, 6);
    const key = `20${yy}-${mm}`;
    const label = `${months[parseInt(mm,10)-1]} 20${yy}`;

    if (key !== groupKey) {
      group = document.createElement('optgroup');
      group.label = label;
      dom.puzzleSelect.appendChild(group);
      groupKey = key;
    }

    const opt = document.createElement('option');
    opt.value = id;
    const archived = state.archivedIds.has(String(id));
    opt.textContent = `${parseInt(dd,10)} ${months[parseInt(mm,10)-1]}, 20${yy}${archived ? ' ★' : ''}`;
    opt.title = archived ? 'Archived (local)' : 'Live';
    group.appendChild(opt);
  });
}

function formatPuzzleId(id) {
  // id like "260318" = year 26, month 03, day 18
  if (id.length === 6) {
    const yy = id.slice(0, 2);
    const mm = id.slice(2, 4);
    const dd = id.slice(4, 6);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mIdx = parseInt(mm, 10) - 1;
    const mStr = months[mIdx] || mm;
    return `${mStr} ${parseInt(dd,10)}, 20${yy}`;
  }
  return id;
}

// ============================================================
// PUZZLE PARSING
// ============================================================
function parsePuzzle(raw) {
  const lines = raw.split('\n');

  // Helper: skip blank lines, return array of non-blank blocks
  // The format has entries separated by single blank lines
  // We'll walk line by line tracking position

  let i = 0;
  const next = () => lines[i++] ?? '';
  const skip = () => { while (i < lines.length && lines[i].trim() === '') i++; };

  // Line 0: "ARCHIVE"
  skip(); const header = next().trim(); // ARCHIVE
  if (header !== 'ARCHIVE') throw new Error('Not an ARCHIVE format');

  skip(); const puzzleId = next().trim();
  skip(); const dateStr  = next().trim();
  skip(); const author   = next().trim();
  skip(); const width    = parseInt(next().trim(), 10);
  skip(); const height   = parseInt(next().trim(), 10);
  skip(); const nAcross  = parseInt(next().trim(), 10);
  skip(); const nDown    = parseInt(next().trim(), 10);
  skip(); // move to grid rows

  // Parse grid rows. Circles are encoded inline as %LETTER% within each row.
  // '#' = black cell, '.' = empty white cell (no known answer), letter = answer.
  // Some puzzles have a trailing all-dots row after the real grid — detect and skip it.
  const solution = Array.from({ length: height }, () => Array(width).fill('#'));
  const circles  = Array.from({ length: height }, () => Array(width).fill(false));
  const shaded   = Array.from({ length: height }, () => Array(width).fill(false));
  const hidden   = Array.from({ length: height }, () => Array(width).fill(false));

  for (let r = 0; r < height; r++) {
    let row = next();
    // skip any blank lines that appear within the grid section
    while (row.trim() === '' && i < lines.length) row = next();
    let c = 0;
    let j = 0;
    while (j < row.length && c < width) {
      let advanceCol = true;
      if (row[j] === '%') {
        // '%' prefix: next char is the letter, cell is circled
        j++;
        solution[r][c] = row[j] ?? '';
        j++;
        circles[r][c]  = true;
      } else if (row[j] === '^') {
        // '^' prefix: next char is the letter, cell is shaded
        j++;
        solution[r][c] = row[j] ?? '';
        j++;
        shaded[r][c]   = true;
      } else if (row[j] === ',') {
        // ',' prefix: next char is appended to the previous cell (rebus)
        j++;
        if (c > 0 && row[j] !== undefined) {
          solution[r][c - 1] += row[j];
        }
        j++;
        advanceCol = false; // don't consume a new column slot
      } else if (row[j] === '.') {
        // '.' = void/hidden cell (transparent black)
        solution[r][c] = '#';
        hidden[r][c]   = true;
        j++;
      } else {
        // '#' = black cell, letter = answer
        solution[r][c] = row[j];
        j++;
      }
      if (advanceCol) c++;
    }
  }

  // Some formats declare height=N but the last row is all dots (empty white cells),
  // which is a format artifact. Trim it so the grid doesn't show a phantom empty row.
  {
    // Trim phantom trailing row: an all-void (originally all-'.') row that is a format artifact.
    const lastHidden = hidden[hidden.length - 1];
    if (lastHidden && lastHidden.every(v => v)) {
      solution.pop();
      circles.pop();
      shaded.pop();
      hidden.pop();
      // height is re-derived from solution.length below
    }
  }

  // Also consume any all-dots row immediately following the grid in the raw text,
  // which appears in some older puzzle formats as a circles indicator line.
  {
    let peek = i;
    while (peek < lines.length && lines[peek].trim() === '') peek++;
    if (peek < lines.length) {
      const candidate = lines[peek].trim();
      if (candidate.length === width && /^\.+$/.test(candidate)) {
        i = peek + 1;
      }
    }
  }

  skip(); // blank line before clues

  // Read across clues (nAcross lines)
  const acrossCluesRaw = [];
  for (let k = 0; k < nAcross; k++) {
    const line = next();
    acrossCluesRaw.push(line.trim());
  }

  skip(); // blank line

  // Read down clues (nDown lines)
  const downCluesRaw = [];
  for (let k = 0; k < nDown; k++) {
    const line = next();
    downCluesRaw.push(line.trim());
  }

  return { puzzleId, dateStr, author, width, height: solution.length, solution, circles, shaded, hidden, acrossCluesRaw, downCluesRaw };
}

// ============================================================
// GRID NUMBERING
// ============================================================
function buildNumbering(solution, width, height) {
  const cellNums = Array.from({ length: height }, () => Array(width).fill(null));
  const acrossStarts = [];  // { num, r, c }
  const downStarts   = [];

  let num = 1;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === '#') continue;

      const startsAcross =
        (c === 0 || solution[r][c - 1] === '#') &&
        (c + 1 < width && solution[r][c + 1] !== '#');

      const startsDown =
        (r === 0 || solution[r - 1][c] === '#') &&
        (r + 1 < height && solution[r + 1][c] !== '#');

      if (startsAcross || startsDown) {
        cellNums[r][c] = num;
        if (startsAcross) acrossStarts.push({ num, r, c });
        if (startsDown)   downStarts.push({ num, r, c });
        num++;
      }
    }
  }

  return { cellNums, acrossStarts, downStarts };
}

// Build word maps: num -> [{r,c}]
function buildWordMaps(solution, width, height, acrossStarts, downStarts) {
  const acrossMap = {};
  const downMap   = {};
  const cellToAcross = {};
  const cellToDown   = {};

  for (const { num, r, c } of acrossStarts) {
    const cells = [];
    let cc = c;
    while (cc < width && solution[r][cc] !== '#') {
      cells.push({ r, c: cc });
      cellToAcross[cellKey(r, cc)] = num;
      cc++;
    }
    acrossMap[num] = cells;
  }

  for (const { num, r, c } of downStarts) {
    const cells = [];
    let rr = r;
    while (rr < height && solution[rr][c] !== '#') {
      cells.push({ r: rr, c });
      cellToDown[cellKey(rr, c)] = num;
      rr++;
    }
    downMap[num] = cells;
  }

  return { acrossMap, downMap, cellToAcross, cellToDown };
}

// Build clue objects from raw arrays and start positions
function buildClues(acrossCluesRaw, downCluesRaw, acrossStarts, downStarts) {
  const acrossClues = acrossStarts.map((s, i) => ({
    num:  s.num,
    clue: acrossCluesRaw[i] ?? '',
  }));
  const downClues = downStarts.map((s, i) => ({
    num:  s.num,
    clue: downCluesRaw[i] ?? '',
  }));
  return { acrossClues, downClues };
}

// ============================================================
// LOAD & INITIALIZE PUZZLE
// ============================================================
async function loadPuzzle(id) {
  showLoading(`Loading puzzle ${formatPuzzleId(id)}...`);
  stopTimer();
  winShown = false;

  try {
    let raw;
    if (state.archivedIds.has(String(id))) {
      // Serve from local archive (same-origin, no proxy needed)
      const res = await fetch(localPuzzlePath(id));
      if (!res.ok) throw new Error(`Local fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      raw = new TextDecoder('iso-8859-1').decode(buf);
    } else {
      raw = await fetchText(`${BASE_URL}?date=${id}`);
    }
    const data  = parsePuzzle(raw);
    const saved = loadProgressFromStorage(data.puzzleId);
    initPuzzleFromData(data, saved);
  } catch (err) {
    console.error(err);
    showError(`Failed to load puzzle: ${err.message}`);
  }
}

function initPuzzleFromData(data, savedProgress = null) {
  const { puzzleId, dateStr, author, width, height, solution, circles, shaded, hidden, acrossCluesRaw, downCluesRaw } = data;

  const { cellNums, acrossStarts, downStarts } = buildNumbering(solution, width, height);
  const { acrossMap, downMap, cellToAcross, cellToDown } =
    buildWordMaps(solution, width, height, acrossStarts, downStarts);
  const { acrossClues, downClues } = buildClues(acrossCluesRaw, downCluesRaw, acrossStarts, downStarts);

  // Assign to state
  state.puzzleId    = puzzleId;
  state.dateStr     = dateStr;
  state.author      = author;
  state.width       = width;
  state.height      = height;
  state.solution    = solution;
  state.circles     = circles;
  state.shaded      = shaded  ?? Array.from({ length: height }, () => Array(width).fill(false));
  state.hidden      = hidden  ?? Array.from({ length: height }, () => Array(width).fill(false));
  state.cellNums    = cellNums;
  state.acrossClues = acrossClues;
  state.downClues   = downClues;
  state.acrossMap   = acrossMap;
  state.downMap     = downMap;
  state.cellToAcross = cellToAcross;
  state.cellToDown   = cellToDown;

  // Init user grid
  if (savedProgress) {
    state.userGrid  = savedProgress.userGrid;
    state.revealed  = savedProgress.revealed;
    state.locked    = savedProgress.locked;
    state.timerSec  = savedProgress.timerSec ?? 0;
  } else {
    state.userGrid  = Array.from({ length: height }, () => Array(width).fill(''));
    state.revealed  = Array.from({ length: height }, () => Array(width).fill(false));
    state.locked    = Array.from({ length: height }, () => Array(width).fill(false));
    state.timerSec  = 0;
  }
  state.incorrect = Array.from({ length: height }, () => Array(width).fill(false));
  state.history = [];
  state.future  = [];

  // Restore or find first selectable cell
  if (savedProgress?.selRow != null && !isBlack(savedProgress.selRow, savedProgress.selCol)) {
    state.selRow    = savedProgress.selRow;
    state.selCol    = savedProgress.selCol;
    state.direction = savedProgress.direction ?? 'across';
  } else {
    state.selRow  = 0;
    state.selCol  = 0;
    state.direction = 'across';
    outerLoop:
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!isBlack(r, c)) { state.selRow = r; state.selCol = c; break outerLoop; }
      }
    }
  }

  // Reset timer
  stopTimer();
  state.timerStarted = false;
  state.timerPaused  = false;
  state.timerHidden  = false;
  dom.timerDisplay.classList.remove('hidden-time');
  dom.btnTimerToggle.textContent = 'Hide';
  updatePauseIcon();
  updateTimerDisplay();

  // Render
  dom.puzzleTitle.textContent  = dateStr || `Puzzle ${puzzleId}`;
  dom.puzzleAuthor.textContent = author || '';
  renderGrid();   // builds cellEls cache + calls updateAllCellVisuals
  renderClues();
  applySelectionHighlights();
  updateClueHighlights();
  showPuzzle();
  // Let the layout settle then fit the grid (double rAF ensures paint is done)
  requestAnimationFrame(() => requestAnimationFrame(() => fitGrid()));

  // Update puzzle selector
  if (state.puzzleList.includes(String(puzzleId))) {
    dom.puzzleSelect.value = String(puzzleId);
  }
}

// ============================================================
// GRID RENDERING
// ============================================================

// Cache of cell elements indexed by [r][c] for O(1) lookup
let cellEls = [];

function renderGrid() {
  const grid = dom.grid;
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${state.width}, var(--cell-size))`;
  grid.style.gridTemplateRows    = `repeat(${state.height}, var(--cell-size))`;

  // Reset element cache
  cellEls = Array.from({ length: state.height }, () => Array(state.width).fill(null));

  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const cell = document.createElement('div');
      cell.className = 'xw-cell';
      cellEls[r][c] = cell;

      if (isBlack(r, c)) {
        cell.classList.add(isVoid(r, c) ? 'void' : 'black');
      } else {
        // Number
        const num = state.cellNums[r][c];
        if (num !== null) {
          const numEl = document.createElement('span');
          numEl.className = 'cell-num';
          numEl.textContent = num;
          cell.appendChild(numEl);
        }

        // Letter
        const letterEl = document.createElement('span');
        letterEl.className = 'cell-letter';
        cell.appendChild(letterEl);

        // Circle / shaded / rebus gimmicks
        if (state.circles[r]?.[c]) cell.classList.add('circled');
        if (state.shaded[r]?.[c])  cell.classList.add('shaded');
        if (isRebus(r, c))         cell.classList.add('rebus');

        // Capture r/c in closure
        cell.addEventListener('click', ((row, col) => () => onCellClick(row, col))(r, c));
      }

      grid.appendChild(cell);
    }
  }

  updateAllCellVisuals();
}

// Update all cell visual contents (letters + state classes)
function updateAllCellVisuals() {
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      if (!isBlack(r, c)) updateCellVisual(r, c);
    }
  }
}

function getCellEl(r, c) {
  return cellEls[r]?.[c] ?? null;
}

function updateCellVisual(r, c) {
  const el = getCellEl(r, c);
  if (!el || isBlack(r, c)) return;

  // Letter
  const letterEl = el.querySelector('.cell-letter');
  if (letterEl) letterEl.textContent = state.userGrid[r][c] || '';

  // State classes (order matters — later classes override)
  el.classList.remove('incorrect', 'correct-locked', 'revealed', 'word-highlight', 'selected');

  if (state.revealed[r][c])  el.classList.add('revealed');
  if (state.locked[r][c])    el.classList.add('correct-locked');
  if (state.incorrect[r][c]) el.classList.add('incorrect');
}

// ============================================================
// CLUE RENDERING
// ============================================================
function renderClues() {
  renderClueList(dom.acrossList, state.acrossClues, 'across');
  renderClueList(dom.downList,   state.downClues,   'down');
}

function renderClueList(listEl, clues, dir) {
  listEl.innerHTML = '';
  for (const { num, clue } of clues) {
    const li = document.createElement('li');
    li.className = 'clue-item';
    li.dataset.num = num;
    li.dataset.dir = dir;

    const numSpan  = document.createElement('span');
    numSpan.className = 'clue-num';
    numSpan.textContent = num;

    const textSpan = document.createElement('span');
    textSpan.className = 'clue-text';
    textSpan.textContent = clue;

    li.appendChild(numSpan);
    li.appendChild(textSpan);
    li.addEventListener('click', () => onClueClick(num, dir));
    listEl.appendChild(li);
  }
}

// ============================================================
// SELECTION & NAVIGATION
// ============================================================

/**
 * Full redraw: cell data (letters, state classes) + selection highlighting.
 * Call after any change to userGrid / revealed / locked / incorrect.
 */
function fullRedraw() {
  updateAllCellVisuals();
  applySelectionHighlights();
  updateClueHighlights();
  saveProgressToStorage();
  checkWin();
}

/**
 * Fast redraw: only update selection/word highlights + clue panel.
 * Call when the selected cell or direction changes but cell data hasn't changed.
 */
function updateSelection() {
  applySelectionHighlights();
  updateClueHighlights();
}

/**
 * Apply word-highlight and selected classes to grid cells.
 * Must be called after updateAllCellVisuals (which strips these classes).
 */
function applySelectionHighlights() {
  // Clear selection classes from every white cell
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const el = cellEls[r]?.[c];
      if (el && !isBlack(r, c)) el.classList.remove('selected', 'word-highlight');
    }
  }

  const { selRow: r, selCol: c, direction } = state;

  // Active word highlight
  const wordCells = getCurrentWordCells();
  for (const { r: wr, c: wc } of wordCells) {
    const el = getCellEl(wr, wc);
    if (el) el.classList.add('word-highlight');
  }

  // Selected cell (on top of word highlight)
  const selEl = getCellEl(r, c);
  if (selEl) selEl.classList.add('selected');
}

/**
 * Update clue panel highlights and active clue bar.
 */
function updateClueHighlights() {
  // Clear all active-clue marks
  dom.acrossList.querySelectorAll('.clue-item').forEach(el => el.classList.remove('active-clue', 'active-clue-cross'));
  dom.downList.querySelectorAll('.clue-item').forEach(el => el.classList.remove('active-clue', 'active-clue-cross'));

  // Panel header active state
  dom.acrossPanel.classList.remove('active-dir');
  dom.downPanel.classList.remove('active-dir');
  if (state.direction === 'across') dom.acrossPanel.classList.add('active-dir');
  else                              dom.downPanel.classList.add('active-dir');

  const { selRow: r, selCol: c, direction } = state;
  const acrossNum = state.cellToAcross[cellKey(r, c)];
  const downNum   = state.cellToDown[cellKey(r, c)];

  // Scroll both panels to show the relevant clue.
  // Use instant scroll for the orthogonal panel to avoid jitter.
  const acrossSmooth = direction === 'across';
  if (acrossNum != null) scrollClueIntoView(dom.acrossList, acrossNum, acrossSmooth);
  if (downNum   != null) scrollClueIntoView(dom.downList,   downNum,   !acrossSmooth);

  // Highlight active direction clue (strong)
  const activeNum  = direction === 'across' ? acrossNum : downNum;
  const activeList = direction === 'across' ? dom.acrossList : dom.downList;
  if (activeNum != null) {
    const li = activeList.querySelector(`[data-num="${activeNum}"]`);
    if (li) li.classList.add('active-clue');
  }

  // Highlight crossing direction clue (distinct dimmer style)
  const crossNum  = direction === 'across' ? downNum   : acrossNum;
  const crossList = direction === 'across' ? dom.downList : dom.acrossList;
  if (crossNum != null) {
    const li = crossList.querySelector(`[data-num="${crossNum}"]`);
    if (li) li.classList.add('active-clue-cross');
  }

  // Active clue bar
  const curClue = getCurrentClue();
  dom.activeClueNum.textContent  = curClue ? `${curClue.num} ${direction === 'across' ? 'A' : 'D'}` : '';
  dom.activeClueText.textContent = curClue?.clue ?? '';
  const wordLen = getCurrentWordCells().length;
  dom.activeClueLen.textContent = wordLen ? `(${wordLen})` : '';
}

function scrollClueIntoView(listEl, num, smooth = true) {
  const li = listEl.querySelector(`[data-num="${num}"]`);
  if (!li) return;
  // Center the active clue in the scrollable list
  const listH = listEl.clientHeight;
  const itemTop = li.offsetTop;
  const itemH   = li.offsetHeight;
  listEl.scrollTo({ top: itemTop - (listH / 2) + (itemH / 2), behavior: smooth ? 'smooth' : 'instant' });
}

function getCurrentWordCells() {
  const { selRow: r, selCol: c, direction } = state;
  const num = direction === 'across'
    ? state.cellToAcross[cellKey(r, c)]
    : state.cellToDown[cellKey(r, c)];
  if (num == null) return [];
  return direction === 'across'
    ? (state.acrossMap[num] ?? [])
    : (state.downMap[num] ?? []);
}

function getCurrentClue() {
  const { selRow: r, selCol: c, direction } = state;
  const num = direction === 'across'
    ? state.cellToAcross[cellKey(r, c)]
    : state.cellToDown[cellKey(r, c)];
  if (num == null) return null;
  const list = direction === 'across' ? state.acrossClues : state.downClues;
  return list.find(cl => cl.num === num) ?? null;
}

function selectCell(r, c, dir = null) {
  if (!inBounds(r, c) || isBlack(r, c)) return;
  state.selRow = r;
  state.selCol = c;
  if (dir) state.direction = dir;
  updateSelection();
  ensureTimerStarted();
  // On touch devices, focus the hidden input so the virtual keyboard appears
  if (navigator.maxTouchPoints > 0) {
    document.getElementById('xw-mobile-input')?.focus({ preventScroll: true });
  }
}

// ============================================================
// INPUT HANDLERS
// ============================================================
function onCellClick(r, c) {
  if (isBlack(r, c)) return;
  ensureTimerStarted();

  if (r === state.selRow && c === state.selCol) {
    // Toggle direction
    toggleDirection();
  } else {
    // If clicked cell has no across word but has down word, switch to down
    const hasAcross = state.cellToAcross[cellKey(r, c)] != null;
    const hasDown   = state.cellToDown[cellKey(r, c)] != null;
    let newDir = state.direction;
    if (!hasAcross && hasDown) newDir = 'down';
    else if (hasAcross && !hasDown) newDir = 'across';
    selectCell(r, c, newDir);
  }
}

function onClueClick(num, dir) {
  ensureTimerStarted();
  const map = dir === 'across' ? state.acrossMap : state.downMap;
  const cells = map[num];
  if (!cells || cells.length === 0) return;

  // Find first empty cell in the word, else first cell
  let target = cells[0];
  for (const cell of cells) {
    if (!state.userGrid[cell.r][cell.c]) { target = cell; break; }
  }
  selectCell(target.r, target.c, dir);
}

function toggleDirection() {
  const { selRow: r, selCol: c } = state;
  const hasAcross = state.cellToAcross[cellKey(r, c)] != null;
  const hasDown   = state.cellToDown[cellKey(r, c)] != null;
  if (hasAcross && hasDown) {
    state.direction = state.direction === 'across' ? 'down' : 'across';
    updateSelection();
  }
}

document.addEventListener('keydown', onKeyDown);

function onKeyDown(e) {
  if (!state.puzzleId) return;
  if (dom.modalOverlay.classList.contains('hidden') === false) {
    if (e.key === 'Enter' || e.key === 'Escape') closeModal();
    return;
  }

  const tag = document.activeElement?.tagName;
  const isMobileInput = document.activeElement?.id === 'xw-mobile-input';
  if (!isMobileInput && (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) return;

  const { selRow: r, selCol: c, direction } = state;

  // Ctrl+Z: undo, Ctrl+Shift+Z: redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
    return;
  }

  // Ctrl+Backspace: clear word (excluding shared/intersection cells)
  // Ctrl+Shift+Backspace: clear word (including shared cells)
  if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
    e.preventDefault();
    clearCurrentWord(/* includeShared */ e.shiftKey);
    return;
  }

  // Shift shortcuts
  if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
    switch (e.key) {
      case 'C':
        e.preventDefault();
        doCheck('all');
        return;
      case 'W':
        e.preventDefault();
        doCheck('word');
        return;
      case 'P':
        e.preventDefault();
        doPartialCheck('word');
        return;
    }
  }

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      if (direction === 'across') moveInWord(1);
      else if (state.arrowDir) selectCell(r, nextCol(r, c, 1), 'across');
      else selectCell(r, nextCol(r, c, 1));
      break;

    case 'ArrowLeft':
      e.preventDefault();
      if (direction === 'across') moveInWord(-1);
      else if (state.arrowDir) selectCell(r, nextCol(r, c, -1), 'across');
      else selectCell(r, nextCol(r, c, -1));
      break;

    case 'ArrowDown':
      e.preventDefault();
      if (direction === 'down') moveInWord(1);
      else if (state.arrowDir) selectCell(nextRow(r, c, 1), c, 'down');
      else selectCell(nextRow(r, c, 1), c);
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (direction === 'down') moveInWord(-1);
      else if (state.arrowDir) selectCell(nextRow(r, c, -1), c, 'down');
      else selectCell(nextRow(r, c, -1), c);
      break;

    case 'Home': {
      e.preventDefault();
      const wc = getCurrentWordCells();
      if (wc.length) selectCell(wc[0].r, wc[0].c);
      break;
    }

    case 'End': {
      e.preventDefault();
      const wc = getCurrentWordCells();
      if (wc.length) selectCell(wc[wc.length - 1].r, wc[wc.length - 1].c);
      break;
    }

    case ' ':
      e.preventDefault();
      toggleDirection();
      break;

    case 'Tab':
      e.preventDefault();
      e.shiftKey ? goToPrevWord() : goToNextWord();
      break;

    case 'Backspace':
      e.preventDefault();
      handleBackspace();
      break;

    case 'Delete':
      e.preventDefault();
      handleDelete();
      break;

    default:
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleLetterKey(e.key.toUpperCase());
      }
      break;
  }
}

// Move to next non-black cell in a direction within the grid
function nextCol(r, c, delta) {
  let nc = c + delta;
  while (inBounds(r, nc) && isBlack(r, nc)) nc += delta;
  return inBounds(r, nc) ? nc : c;
}
function nextRow(r, c, delta) {
  let nr = r + delta;
  while (inBounds(nr, c) && isBlack(nr, c)) nr += delta;
  return inBounds(nr, c) ? nr : r;
}

function moveInWord(delta) {
  const { selRow: r, selCol: c, direction } = state;
  if (direction === 'across') {
    const nc = nextCol(r, c, delta);
    if (nc !== c) selectCell(r, nc);
  } else {
    const nr = nextRow(r, c, delta);
    if (nr !== r) selectCell(nr, c);
  }
}

function handleLetterKey(letter) {
  ensureTimerStarted();
  const { selRow: r, selCol: c } = state;
  if (isBlack(r, c)) return;
  if (state.locked[r][c]) { advanceAfterEntry(); return; }

  pushHistory();

  if (isRebus(r, c)) {
    const rebusLen = state.solution[r][c].length;
    const current  = state.userGrid[r][c];
    // Append letter; if already full, restart from this letter
    state.userGrid[r][c] = current.length >= rebusLen ? letter : current + letter;
    state.incorrect[r][c] = false;
    updateCellVisual(r, c);
    const el = getCellEl(r, c);
    if (el) el.classList.add('selected');
    // Only advance once the rebus entry is fully typed
    if (state.userGrid[r][c].length === rebusLen) advanceAfterEntry();
  } else {
    state.userGrid[r][c]  = letter;
    state.incorrect[r][c] = false;
    updateCellVisual(r, c);
    const el = getCellEl(r, c);
    if (el) el.classList.add('selected');
    advanceAfterEntry();
  }

  saveProgressToStorage();
}

function advanceAfterEntry() {
  const { selRow: r, selCol: c, direction } = state;
  const wordCells = getCurrentWordCells();
  const curIdx = wordCells.findIndex(cell => cell.r === r && cell.c === c);

  if (curIdx === -1) return;

  if (state.overtype) {
    // Overtype: move to the very next unlocked cell, whether empty or not
    for (let i = curIdx + 1; i < wordCells.length; i++) {
      const { r: nr, c: nc } = wordCells[i];
      if (!state.locked[nr][nc]) { selectCell(nr, nc); return; }
    }
  } else {
    // Default: skip to the next empty (unfilled) unlocked cell
    for (let i = curIdx + 1; i < wordCells.length; i++) {
      const { r: nr, c: nc } = wordCells[i];
      if (!state.locked[nr][nc] && state.userGrid[nr][nc] === '') {
        selectCell(nr, nc);
        return;
      }
    }
    // No empty cell ahead — fall back to just the next unlocked cell
    for (let i = curIdx + 1; i < wordCells.length; i++) {
      const { r: nr, c: nc } = wordCells[i];
      if (!state.locked[nr][nc]) { selectCell(nr, nc); return; }
    }
  }

  // At end of word — stay put
}

function handleBackspace() {
  ensureTimerStarted();
  const { selRow: r, selCol: c, direction } = state;

  if (state.locked[r][c]) {
    // Move back without deleting
    movePrevInWord();
    return;
  }

  if (state.userGrid[r][c] !== '') {
    pushHistory();
    // For rebus cells, remove just the last typed character
    if (isRebus(r, c) && state.userGrid[r][c].length > 1) {
      state.userGrid[r][c] = state.userGrid[r][c].slice(0, -1);
    } else {
      state.userGrid[r][c] = '';
    }
    state.incorrect[r][c] = false;
    updateCellVisual(r, c);
    const el = getCellEl(r, c);
    if (el) el.classList.add('selected');
    saveProgressToStorage();
  } else {
    movePrevInWord();
  }
}

function handleDelete() {
  ensureTimerStarted();
  const { selRow: r, selCol: c } = state;
  if (isBlack(r, c) || state.locked[r][c]) return;

  pushHistory();
  // For rebus cells, remove the last typed character; otherwise clear the cell
  if (isRebus(r, c) && state.userGrid[r][c].length > 1) {
    state.userGrid[r][c] = state.userGrid[r][c].slice(0, -1);
  } else {
    state.userGrid[r][c] = '';
  }
  state.incorrect[r][c] = false;
  updateCellVisual(r, c);
  const el = getCellEl(r, c);
  if (el) el.classList.add('selected');
  // Move forward (opposite of backspace)
  advanceAfterEntry();
  saveProgressToStorage();
}

function movePrevInWord() {
  const { selRow: r, selCol: c } = state;
  const wordCells = getCurrentWordCells();
  const curIdx = wordCells.findIndex(cell => cell.r === r && cell.c === c);
  // At start of word — stay put
  if (curIdx <= 0) return;
  const { r: pr, c: pc } = wordCells[curIdx - 1];
  selectCell(pr, pc);
  if (!state.locked[pr][pc]) {
    pushHistory();
    state.userGrid[pr][pc]  = '';
    state.incorrect[pr][pc] = false;
    updateCellVisual(pr, pc);
    const el = getCellEl(pr, pc);
    if (el) el.classList.add('selected');
    saveProgressToStorage();
  }
}

// ============================================================
// WORD NAVIGATION (Tab / Shift+Tab)
// ============================================================
function getWordList() {
  // Returns ordered list of {num, dir} words in reading order (interleaved by num)
  const words = [];
  const allNums = new Set([
    ...state.acrossClues.map(c => c.num),
    ...state.downClues.map(c => c.num),
  ]);
  const sorted = [...allNums].sort((a, b) => a - b);
  for (const num of sorted) {
    if (state.acrossMap[num]) words.push({ num, dir: 'across' });
    if (state.downMap[num])   words.push({ num, dir: 'down' });
  }
  return words;
}

function getFullWordList() {
  // All Across words (sorted by num) then all Down words (sorted by num).
  // Used by Tab so you sweep all Acrosses then all Downs before looping.
  const across = state.acrossClues.map(c => ({ num: c.num, dir: 'across' }))
                   .sort((a, b) => a.num - b.num);
  const down   = state.downClues.map(c => ({ num: c.num, dir: 'down' }))
                   .sort((a, b) => a.num - b.num);
  return [...across, ...down];
}

function getCurrentWordIndex() {
  const { selRow: r, selCol: c, direction } = state;
  const num = direction === 'across'
    ? state.cellToAcross[cellKey(r, c)]
    : state.cellToDown[cellKey(r, c)];
  const words = getWordList().filter(w => w.dir === direction);
  return words.findIndex(w => w.num === num);
}

function isWordComplete(num, dir) {
  const map = dir === 'across' ? state.acrossMap : state.downMap;
  const cells = map[num] ?? [];
  return cells.length > 0 && cells.every(({ r, c }) => state.userGrid[r][c] === state.solution[r][c]);
}

function isWordLocked(num, dir) {
  const map = dir === 'across' ? state.acrossMap : state.downMap;
  const cells = map[num] ?? [];
  return cells.length > 0 && cells.every(({ r, c }) => state.locked[r][c]);
}

function goToNextWord() {
  const words = getFullWordList();
  if (words.length === 0) return;
  let idx = words.findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction);
  const startIdx = idx === -1 ? 0 : idx;
  let next = (startIdx + 1) % words.length;
  // Skip fully-locked (confirmed) words only, not merely correct ones
  let attempts = 0;
  while (attempts < words.length && isWordLocked(words[next].num, words[next].dir)) {
    next = (next + 1) % words.length;
    attempts++;
  }
  state.direction = words[next].dir;
  jumpToWord(words[next]);
}

function goToPrevWord() {
  const words = getFullWordList();
  if (words.length === 0) return;
  let idx = words.findIndex(w => w.num === getCurrentWordIndex_num() && w.dir === state.direction);
  const startIdx = idx === -1 ? 0 : idx;
  let next = (startIdx - 1 + words.length) % words.length;
  // Skip fully-locked (confirmed) words only, not merely correct ones
  let attempts = 0;
  while (attempts < words.length && isWordLocked(words[next].num, words[next].dir)) {
    next = (next - 1 + words.length) % words.length;
    attempts++;
  }
  state.direction = words[next].dir;
  jumpToWord(words[next]);
}

function getCurrentWordIndex_num() {
  const { selRow: r, selCol: c, direction } = state;
  return direction === 'across'
    ? state.cellToAcross[cellKey(r, c)]
    : state.cellToDown[cellKey(r, c)];
}

function jumpToWord({ num, dir }) {
  const map = dir === 'across' ? state.acrossMap : state.downMap;
  const cells = map[num];
  if (!cells || cells.length === 0) return;
  // Go to first empty cell
  let target = cells[0];
  for (const cell of cells) {
    if (!state.userGrid[cell.r][cell.c]) { target = cell; break; }
  }
  selectCell(target.r, target.c, dir);
}

// ============================================================
// CHECK / PARTIAL CHECK / REVEAL
// ============================================================
function getScopeCells(scope) {
  const { selRow: r, selCol: c, direction } = state;
  if (scope === 'letter') return [{ r, c }];
  if (scope === 'word')   return getCurrentWordCells();
  // 'all'
  const cells = [];
  for (let rr = 0; rr < state.height; rr++) {
    for (let cc = 0; cc < state.width; cc++) {
      if (!isBlack(rr, cc)) cells.push({ r: rr, c: cc });
    }
  }
  return cells;
}

function clearCurrentWord(includeShared = false) {
  const cells = getCurrentWordCells();
  if (cells.length === 0) return;
  pushHistory();
  for (const { r, c } of cells) {
    if (state.locked[r][c]) continue;
    const key = cellKey(r, c);
    const isShared = state.cellToAcross[key] != null && state.cellToDown[key] != null;
    if (!includeShared && isShared) continue;
    state.userGrid[r][c]  = '';
    state.incorrect[r][c] = false;
  }
  fullRedraw();
}

function doCheck(scope) {
  const cells = getScopeCells(scope);
  let emptyCount = 0;

  if (scope === 'word') {
    // Flash bar green/red — no cell highlighting. Requires full word to be filled.
    if (cells.some(({ r, c }) => !state.userGrid[r][c])) return; // incomplete word, do nothing
    const correct = cells.every(({ r, c }) => state.userGrid[r][c] === state.solution[r][c]);
    flashActiveClueBar(correct);
    if (correct && state.lockMode) { pushHistory(); checkLockWords(cells); fullRedraw(); }
    return;
  }

  // 'all' scope: word-level only — lock correct words, leave wrong ones alone
  pushHistory();
  const allWords = [
    ...Object.entries(state.acrossMap).map(([num]) => ({ num: +num, dir: 'across' })),
    ...Object.entries(state.downMap).map(([num])   => ({ num: +num, dir: 'down' })),
  ];
  for (const { num, dir } of allWords) {
    const map = dir === 'across' ? state.acrossMap : state.downMap;
    const wordCells = map[num] ?? [];
    if (wordCells.length === 0) continue;
    const allFilled  = wordCells.every(({ r, c }) => state.userGrid[r][c] !== '');
    const allCorrect = wordCells.every(({ r, c }) => state.userGrid[r][c] === state.solution[r][c]);
    if (allFilled && allCorrect && state.lockMode) {
      for (const { r, c } of wordCells) {
        state.locked[r][c]    = true;
        state.incorrect[r][c] = false;
      }
    }
  }
  fullRedraw();
}

function flashActiveClueBar(correct) {
  const bar = dom.activeClueBar;
  const cls = correct ? 'flash-correct' : 'flash-wrong-bar';
  bar.classList.remove('flash-correct', 'flash-wrong-bar');
  void bar.offsetWidth;
  bar.classList.add(cls);
  bar.addEventListener('animationend', () => bar.classList.remove(cls), { once: true });
}

function doPartialCheck(scope) {
  pushHistory();
  const cells = getScopeCells(scope);
  for (const { r, c } of cells) {
    const entered = state.userGrid[r][c];
    const answer  = state.solution[r][c];
    if (!entered) continue; // ignore empty
    if (entered === answer) {
      state.incorrect[r][c] = false;
    } else {
      state.incorrect[r][c] = true;
    }
  }
  checkLockWords(cells);
  fullRedraw();
}

function doReveal(scope) {
  pushHistory();
  const cells = getScopeCells(scope);
  for (const { r, c } of cells) {
    if (state.locked[r][c]) continue;
    state.userGrid[r][c]  = state.solution[r][c];
    state.revealed[r][c]  = true;
    state.incorrect[r][c] = false;
  }
  checkLockWords(cells);
  fullRedraw();
}

function checkLockWord() {
  // Check only the current word
  if (!state.lockMode) return;
  const cells = getCurrentWordCells();
  checkLockWords(cells);
}

function checkLockWords(cells) {
  if (!state.lockMode) return;
  // Collect all word nums that the cells belong to
  const wordSet = new Set();
  for (const { r, c } of cells) {
    const an = state.cellToAcross[cellKey(r, c)];
    const dn = state.cellToDown[cellKey(r, c)];
    if (an != null) wordSet.add(`across:${an}`);
    if (dn != null) wordSet.add(`down:${dn}`);
  }
  for (const key of wordSet) {
    const [dir, numStr] = key.split(':');
    const num = parseInt(numStr, 10);
    const map = dir === 'across' ? state.acrossMap : state.downMap;
    const wordCells = map[num] ?? [];
    if (wordCells.length === 0) continue;
    const allCorrect = wordCells.every(({ r, c }) => state.userGrid[r][c] === state.solution[r][c]);
    if (allCorrect) {
      for (const { r, c } of wordCells) {
        state.locked[r][c] = true;
        state.incorrect[r][c] = false;
      }
    }
  }
}

// ============================================================
// UNDO
// ============================================================
function snapshot() {
  return {
    userGrid:  deepClone2D(state.userGrid),
    revealed:  deepClone2D(state.revealed),
    locked:    deepClone2D(state.locked),
    incorrect: deepClone2D(state.incorrect),
  };
}

function applySnapshot(s) {
  state.userGrid  = s.userGrid;
  state.revealed  = s.revealed;
  state.locked    = s.locked;
  state.incorrect = s.incorrect;
}

function pushHistory() {
  state.history.push(snapshot());
  state.future = []; // clear redo stack on new action
  if (state.history.length > 100) state.history.shift();
}

function doUndo() {
  if (state.history.length === 0) return;
  state.future.push(snapshot());
  applySnapshot(state.history.pop());
  fullRedraw();
}

function doRedo() {
  if (state.future.length === 0) return;
  state.history.push(snapshot());
  applySnapshot(state.future.pop());
  fullRedraw();
}

// ============================================================
// PERSIST TO LOCAL STORAGE
// ============================================================
function storageKey(id) { return `xw-progress-${id}`; }

function saveProgressToStorage() {
  if (!state.puzzleId) return;
  const payload = {
    userGrid:  state.userGrid,
    revealed:  state.revealed,
    locked:    state.locked,
    timerSec:  state.timerSec,
    selRow:    state.selRow,
    selCol:    state.selCol,
    direction: state.direction,
  };
  try {
    localStorage.setItem(storageKey(state.puzzleId), JSON.stringify(payload));
  } catch (_) {}
}

function loadProgressFromStorage(id) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ============================================================
// WIN DETECTION
// ============================================================
let winShown = false;

function checkWin() {
  if (!state.puzzleId || winShown) return;
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      if (isBlack(r, c)) continue;
      if (state.userGrid[r][c] !== state.solution[r][c]) return;
    }
  }
  // All cells correct!
  winShown = true;
  stopTimer();
  showWin();
}

function showWin() {
  const t = formatTime(state.timerSec);
  dom.winTime.textContent = t;
  dom.winPuzzle.textContent = state.dateStr || `Puzzle ${state.puzzleId}`;
  dom.winOverlay.classList.remove('hidden');
}

// ============================================================
// TIMER
// ============================================================
function ensureTimerStarted() {
  if (state.timerStarted) return;
  state.timerStarted = true;
  startTimer();
}

function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerRunning = true;
  state.timerPaused  = false;
  updatePauseIcon();
  state.timerInterval = setInterval(() => {
    if (!state.timerPaused) {
      state.timerSec++;
      updateTimerDisplay();
      saveProgressToStorage();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.timerRunning  = false;
}

function updateTimerDisplay() {
  if (state.timerHidden) {
    dom.timerDisplay.textContent = '----';
    dom.timerDisplay.classList.add('hidden-time');
  } else {
    dom.timerDisplay.textContent = formatTime(state.timerSec);
    dom.timerDisplay.classList.remove('hidden-time');
  }
}

// ============================================================
// EXPORT / IMPORT
// ============================================================
function doExport() {
  if (!state.puzzleId) return;
  const payload = {
    puzzleId:    state.puzzleId,
    dateStr:     state.dateStr,
    author:      state.author,
    width:       state.width,
    height:      state.height,
    solution:    state.solution,
    circles:     state.circles,
    acrossClues: state.acrossClues,
    downClues:   state.downClues,
    userGrid:    state.userGrid,
    revealed:    state.revealed,
    locked:      state.locked,
    timerSec:    state.timerSec,
    selRow:      state.selRow,
    selCol:      state.selCol,
    direction:   state.direction,
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  history.replaceState(null, '', `#data=${b64}`);
  showModal('✓', 'Exported!', 'URL updated with your progress. Copy the URL to save or share.');
}

function tryImportFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith('#data=')) return false;
  try {
    const b64 = hash.slice(6);
    const json = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(json);

    // Re-build grid numbering from solution
    const { puzzleId, dateStr, author, width, height, solution, circles, shaded, hidden, acrossClues, downClues } = payload;

    // acrossClues/downClues already have {num, clue} objects
    // We need acrossCluesRaw and downStarts to pass to initPuzzleFromData
    // Instead, reconstruct directly
    const { cellNums, acrossStarts, downStarts } = buildNumbering(solution, width, height);
    const { acrossMap, downMap, cellToAcross, cellToDown } =
      buildWordMaps(solution, width, height, acrossStarts, downStarts);

    state.puzzleId     = puzzleId;
    state.dateStr      = dateStr;
    state.author       = author;
    state.width        = width;
    state.height       = height;
    state.solution     = solution;
    state.circles      = circles;
    state.shaded       = shaded  ?? Array.from({ length: height }, () => Array(width).fill(false));
    state.hidden       = hidden  ?? Array.from({ length: height }, () => Array(width).fill(false));
    state.cellNums     = cellNums;
    state.acrossClues  = acrossClues;
    state.downClues    = downClues;
    state.acrossMap    = acrossMap;
    state.downMap      = downMap;
    state.cellToAcross = cellToAcross;
    state.cellToDown   = cellToDown;

    state.userGrid  = payload.userGrid;
    state.revealed  = payload.revealed;
    state.locked    = payload.locked;
    state.timerSec  = payload.timerSec ?? 0;
    state.incorrect = Array.from({ length: height }, () => Array(width).fill(false));
    state.history   = [];
    state.future    = [];
    state.timerStarted = false;
    state.timerPaused  = false;
    state.timerHidden  = false;

    // Restore or find first selectable cell
    if (payload.selRow != null && !isBlack(payload.selRow, payload.selCol)) {
      state.selRow    = payload.selRow;
      state.selCol    = payload.selCol;
      state.direction = payload.direction ?? 'across';
    } else {
    state.selRow = 0; state.selCol = 0; state.direction = 'across';
    outerLoop:
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!isBlack(r, c)) { state.selRow = r; state.selCol = c; break outerLoop; }
      }
    }
    }

    stopTimer();
    updateTimerDisplay();
    dom.btnTimerToggle.textContent = 'Hide';
    updatePauseIcon();
    dom.timerDisplay.classList.remove('hidden-time');

    dom.puzzleTitle.textContent  = dateStr || `Puzzle ${puzzleId}`;
    dom.puzzleAuthor.textContent = author || '';
    renderGrid();   // builds cellEls + calls updateAllCellVisuals
    renderClues();
    applySelectionHighlights();
    updateClueHighlights();
    showPuzzle();
    return true;
  } catch (err) {
    console.error('Import failed:', err);
    return false;
  }
}

// ============================================================
// MODAL
// ============================================================
function closeModal() {
  dom.modalOverlay.classList.add('hidden');
}

// ============================================================
// BOOT & EVENT LISTENERS
// ============================================================
async function boot() {
  // Try import from URL hash first
  if (tryImportFromHash()) {
    loadPuzzleList().then(ids => populatePuzzleSelector(ids)).catch(() => {});
    return;
  }

  showLoading('Loading puzzle list...');

  try {
    const ids = await loadPuzzleList();
    populatePuzzleSelector(ids);

    if (ids.length === 0) throw new Error('No puzzles available');

    // Load puzzle specified by ?puzzle= query param, else most recent
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('puzzle');
    const target = (requested && ids.includes(requested)) ? requested : ids[0];
    await loadPuzzle(target);
  } catch (err) {
    console.error(err);
    showError(`Failed to initialize: ${err.message}`);
  }
}

// Puzzle selector
dom.puzzleSelect.addEventListener('change', () => {
  const id = dom.puzzleSelect.value;
  if (id) loadPuzzle(id);
});

// Timer controls
dom.btnTimerToggle.addEventListener('click', () => {
  state.timerHidden = !state.timerHidden;
  dom.btnTimerToggle.textContent = state.timerHidden ? 'Show' : 'Hide';
  updateTimerDisplay();
});

dom.btnTimerPause.addEventListener('click', () => {
  if (!state.timerStarted) return;
  state.timerPaused = !state.timerPaused;
  updatePauseIcon();
});

function updatePauseIcon() {
  const paused = state.timerPaused;
  document.getElementById('icon-pause').style.display = paused  ? 'none'  : '';
  document.getElementById('icon-play').style.display  = paused  ? ''      : 'none';
}

// Check/Reveal Go button
dom.btnGo.addEventListener('click', () => {
  if (!state.puzzleId) return;
  const action = dom.actionSelect.value;
  const scope  = dom.scopeSelect.value;

  if (action === 'check')   doCheck(scope);
  if (action === 'partial') doPartialCheck(scope);
  if (action === 'reveal')  doReveal(scope);
});

// Lock mode
dom.chkLock.addEventListener('change', () => {
  state.lockMode = dom.chkLock.checked;
  localStorage.setItem('xw-lock-mode', state.lockMode ? '1' : '0');
  pushHistory();
  if (state.lockMode) {
    // Lock any already-correct words
    const allCells = [];
    for (let r = 0; r < state.height; r++)
      for (let c = 0; c < state.width; c++)
        if (!isBlack(r, c)) allCells.push({ r, c });
    checkLockWords(allCells);
  } else {
    // Unlock everything and clear all highlights
    for (let r = 0; r < state.height; r++)
      for (let c = 0; c < state.width; c++) {
        state.locked[r][c]    = false;
        state.incorrect[r][c] = false;
      }
  }
  fullRedraw();
});

// Arrow-changes-direction toggle
dom.chkArrowDir.addEventListener('change', () => {
  state.arrowDir = dom.chkArrowDir.checked;
  localStorage.setItem('xw-arrow-dir', state.arrowDir ? '1' : '0');
});
if (localStorage.getItem('xw-arrow-dir') === '1') {
  state.arrowDir = true;
  dom.chkArrowDir.checked = true;
}

// Overtype toggle
dom.chkOvertype.addEventListener('change', () => {
  state.overtype = dom.chkOvertype.checked;
  localStorage.setItem('xw-overtype', state.overtype ? '1' : '0');
});
if (localStorage.getItem('xw-overtype') === '1') {
  state.overtype = true;
  dom.chkOvertype.checked = true;
}

// Export / Import
dom.btnExport.addEventListener('click', doExport);
dom.btnImport.addEventListener('click', () => {
  const hash = prompt('Paste the exported URL fragment (starting with #data=):');
  if (!hash) return;
  window.location.hash = hash.startsWith('#') ? hash : `#${hash}`;
  if (!tryImportFromHash()) showModal('✗', 'Import Failed', 'Could not parse the exported data.');
});

// Clear Incorrect
dom.btnClearIncorrect.addEventListener('click', () => {
  if (!state.puzzleId) return;
  if (!confirm('Clear all incorrect letters from the entire board?')) return;
  const wrongCells = [];
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      if (isBlack(r, c) || state.locked[r][c]) continue;
      const entered = state.userGrid[r][c];
      if (entered && entered !== state.solution[r][c]) {
        wrongCells.push({ r, c });
      }
    }
  }
  if (wrongCells.length === 0) return;

  // Flash red then clear
  for (const { r, c } of wrongCells) {
    const el = getCellEl(r, c);
    if (el) {
      el.classList.remove('flash-wrong');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('flash-wrong');
    }
  }
  pushHistory();
  setTimeout(() => {
    for (const { r, c } of wrongCells) {
      state.userGrid[r][c]  = '';
      state.incorrect[r][c] = false;
      const el = getCellEl(r, c);
      if (el) el.classList.remove('flash-wrong');
    }
    fullRedraw();
  }, 500);
});

// Undo
dom.btnUndo.addEventListener('click', doUndo);

// Modal close
dom.modalClose.addEventListener('click', closeModal);
dom.modalOverlay.addEventListener('click', e => {
  if (e.target === dom.modalOverlay) closeModal();
});

// Win overlay close
dom.winClose.addEventListener('click', () => dom.winOverlay.classList.add('hidden'));
dom.winOverlay.addEventListener('click', e => {
  if (e.target === dom.winOverlay) dom.winOverlay.classList.add('hidden');
});

// Retry
dom.btnRetry.addEventListener('click', () => {
  const id = dom.puzzleSelect.value || (state.puzzleList[0] ?? null);
  if (id) loadPuzzle(id);
  else boot();
});

// ============================================================
// THEME TOGGLE
// ============================================================
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const iconSun  = document.getElementById('icon-sun');
const iconMoon = document.getElementById('icon-moon');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('xw-theme', theme);
  iconSun.style.display  = theme === 'light' ? ''     : 'none';
  iconMoon.style.display = theme === 'light' ? 'none' : '';
}

btnThemeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

/// Load saved theme (default: light)
applyTheme(localStorage.getItem('xw-theme') || 'light');

// Load saved lock-mode setting (default: on)
if (localStorage.getItem('xw-lock-mode') === '0') {
  state.lockMode = false;
  dom.chkLock.checked = false;
}

// ============================================================
// STICKY TOP MEASUREMENT
// Keep --sticky-top in sync with actual header+toolbar height
// so the active clue bar is never obscured when toolbar wraps.
// ============================================================
// Keep --header-h in sync with actual header height so toolbar
// always sticks directly below it, even when the header wraps.
function updateHeaderHeight() {
  const h = document.getElementById('app-header')?.offsetHeight ?? 0;
  document.documentElement.style.setProperty('--header-h', `${h}px`);
}
const headerObserver = new ResizeObserver(updateHeaderHeight);
headerObserver.observe(document.getElementById('app-header'));
updateHeaderHeight();

// Fit grid to available space — compute --cell-size so the entire
// puzzle fits without scrolling, capped at 36px.
function fitGrid() {
  if (!state.puzzleId) return;
  const header     = document.getElementById('app-header');
  const toolbar    = document.getElementById('toolbar');
  const clueBar    = document.getElementById('active-clue-bar');
  const cluePanels = document.getElementById('clue-panels');

  const isMobile = window.innerWidth <= 768;

  let usedH, usedW;
  if (isMobile) {
    // On mobile the clue panels are below the grid, not beside it.
    // Only subtract vertically-stacked elements from height; full width is available.
    usedH = (header?.offsetHeight  ?? 0)
          + (toolbar?.offsetHeight ?? 0)
          + (clueBar?.offsetHeight ?? 0)
          + 16;
    usedW = 16;
  } else {
    usedH = (header?.offsetHeight    ?? 0)
          + (toolbar?.offsetHeight   ?? 0)
          + (clueBar?.offsetHeight   ?? 0)
          + 32;
    usedW = (cluePanels?.offsetWidth ?? 0) + 32;
  }

  const availH = window.innerHeight - usedH;
  const availW = window.innerWidth  - usedW;

  if (availW <= 0 || availH <= 0) return;

  // Subtract the grid's own border (2px each side = 4px) and 1px gaps between cells
  const gridBorderGapW = 4 + (state.width  - 1);
  const gridBorderGapH = 4 + (state.height - 1);

  const byW = Math.floor((availW - gridBorderGapW) / state.width);
  const byH = Math.floor((availH - gridBorderGapH) / state.height);
  const size = Math.min(byW, byH);
  document.documentElement.style.setProperty('--cell-size', `${Math.max(size, 10)}px`);
}
const gridObserver = new ResizeObserver(fitGrid);
gridObserver.observe(document.getElementById('clue-panels'));
window.addEventListener('resize', fitGrid);
// Re-fit when virtual keyboard opens/closes on mobile
window.visualViewport?.addEventListener('resize', fitGrid);

// ============================================================
// MOBILE VIRTUAL KEYBOARD INPUT
// ============================================================
{
  const mobileInput = document.getElementById('xw-mobile-input');
  if (mobileInput) {
    // Capture letter input from the virtual keyboard
    mobileInput.addEventListener('input', () => {
      const val = mobileInput.value;
      mobileInput.value = ''; // clear immediately so next keypress works
      if (!val || !state.puzzleId) return;
      // Take the last typed character (handles IME and autocorrect edge cases)
      const ch = val.slice(-1).toUpperCase();
      if (/^[A-Z]$/.test(ch)) handleLetterKey(ch);
    });

    // Handle special keys from the virtual keyboard
    mobileInput.addEventListener('keydown', (e) => {
      if (!state.puzzleId) return;
      switch (e.key) {
        case 'Backspace':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) clearCurrentWord(e.shiftKey);
          else handleBackspace();
          break;
        case 'Tab':       e.preventDefault(); e.shiftKey ? goToPrevWord() : goToNextWord(); break;
        case ' ':         e.preventDefault(); toggleDirection(); break;
        case 'ArrowLeft':  e.preventDefault(); onKeyDown(e); break;
        case 'ArrowRight': e.preventDefault(); onKeyDown(e); break;
        case 'ArrowUp':    e.preventDefault(); onKeyDown(e); break;
        case 'ArrowDown':  e.preventDefault(); onKeyDown(e); break;
      }
    });

    // Keep the hidden input clear and re-focused when blurred unintentionally
    mobileInput.addEventListener('blur', () => {
      mobileInput.value = '';
    });
  }
}

// ============================================================
// LAUNCH
// ============================================================
boot();
