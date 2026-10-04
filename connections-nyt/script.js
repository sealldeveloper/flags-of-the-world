'use strict';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const CONNECTIONS_API = window.CONNECTIONS_API_BASE || (
  LOCAL_HOSTS.has(window.location.hostname)
    ? '/api/nyt/connections'
    : 'https://nyt-crossword-proxy.my-account-306.workers.dev/nyt/connections'
);
const STORAGE_PREFIX = 'nyt-connections-v1';
const CATEGORY_EMOJI = ['🟨', '🟩', '🟦', '🟪'];
const CATEGORY_NAMES = ['Yellow', 'Green', 'Blue', 'Purple'];
const requestedMode = new URLSearchParams(location.search).get('mode');
function readStored(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function writeStored(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
function removeStored(key) { try { localStorage.removeItem(key); } catch (_) { /* Storage unavailable. */ } }

const state = {
  puzzle: null,
  date: '',
  archivedDates: new Set(),
  wordOrder: [],
  selected: new Set(),
  solved: [],
  mistakesRemaining: 4,
  easyMode: requestedMode === 'easy' || (requestedMode !== 'standard' && readStored(`${STORAGE_PREFIX}:easy-mode`) === '1'),
  guesses: [],
  reveals: [],
  answersRevealed: false,
  continuedFromStandard: false,
  completed: false,
  lost: false,
  transitioning: false,
  requestController: null,
  requestSequence: 0,
};

const dom = {
  puzzleSelect: document.getElementById('puzzle-select'),
  puzzleDate: document.getElementById('puzzle-date'),
  puzzleAuthor: document.getElementById('puzzle-author'),
  puzzleNumber: document.getElementById('puzzle-number'),
  loading: document.getElementById('loading-state'),
  error: document.getElementById('error-state'),
  errorMessage: document.getElementById('error-message'),
  retry: document.getElementById('retry-button'),
  game: document.getElementById('game'),
  dateLabel: document.getElementById('puzzle-date-label'),
  status: document.getElementById('status-message'),
  solvedGroups: document.getElementById('solved-groups'),
  wordGrid: document.getElementById('word-grid'),
  mistakeDots: document.getElementById('mistake-dots'),
  mistakeLabel: document.getElementById('mistake-label'),
  easyMode: document.getElementById('easy-mode'),
  shuffle: document.getElementById('shuffle-button'),
  deselect: document.getElementById('deselect-button'),
  submit: document.getElementById('submit-button'),
  reset: document.getElementById('reset-button'),
  resultOverlay: document.getElementById('result-overlay'),
  resultBox: document.querySelector('.result-box'),
  resultIcon: document.getElementById('result-icon'),
  resultTitle: document.getElementById('result-title'),
  resultSummary: document.getElementById('result-summary'),
  guessCount: document.getElementById('guess-count'),
  history: document.getElementById('guess-history'),
  historyEmpty: document.getElementById('history-empty'),
  reveals: document.getElementById('category-reveals'),
  storageStatus: document.getElementById('storage-status'),
  viewResults: document.getElementById('view-results'),
  continueEasy: document.getElementById('continue-easy'),
  revealAnswers: document.getElementById('reveal-answers'),
  resultCopy: document.getElementById('result-copy'),
  sharePreview: document.getElementById('share-preview'),
  shareStatus: document.getElementById('share-status'),
  share: document.getElementById('share-button'),
  resultClose: document.getElementById('result-close'),
};

function localDateId(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

function recentDates(count) {
  const result = [];
  const date = new Date();
  for (let index = 0; index < count; index += 1) {
    result.push(localDateId(date));
    date.setDate(date.getDate() - 1);
  }
  return result;
}

async function loadArchiveManifest() {
  try {
    const response = await fetch('./puzzles/manifest.json', { cache: 'no-cache' });
    if (!response.ok) return [];
    const dates = await response.json();
    if (!Array.isArray(dates)) return [];
    return dates.filter(isDateId);
  } catch (_) {
    return [];
  }
}

function isDateId(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function formatDate(value, includeYear = true) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: includeYear ? 'numeric' : undefined,
  }).format(date);
}

function populatePuzzleSelector(archivedDates = []) {
  const today = localDateId();
  const dates = [...new Set([...recentDates(90), ...archivedDates])]
    .filter(dateId => dateId <= today)
    .sort((a, b) => b.localeCompare(a));
  let currentGroup = '';
  let group = null;
  dom.puzzleSelect.replaceChildren();

  dates.forEach(dateId => {
    const monthKey = dateId.slice(0, 7);
    if (monthKey !== currentGroup) {
      const [year, month] = monthKey.split('-').map(Number);
      group = document.createElement('optgroup');
      group.label = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' })
        .format(new Date(year, month - 1, 1));
      dom.puzzleSelect.appendChild(group);
      currentGroup = monthKey;
    }
    const option = document.createElement('option');
    option.value = dateId;
    const archived = state.archivedDates.has(dateId);
    option.textContent = `${formatDate(dateId)}${archived ? ' ★' : ''}`;
    option.title = archived ? 'Archived locally' : 'Loaded from the live puzzle service';
    group.appendChild(option);
  });
}

function parsePuzzle(data, requestedDate) {
  if (!data || data.status !== 'OK' || !Array.isArray(data.categories) || data.categories.length !== 4) {
    throw new Error('The puzzle response was not in the expected format.');
  }

  const positions = new Set();
  const categories = data.categories.map((category, categoryIndex) => {
    if (!category || !Array.isArray(category.cards) || category.cards.length !== 4) {
      throw new Error('The puzzle does not contain four complete groups.');
    }
    const cards = category.cards.map(card => {
      const position = Number(card.position);
      const content = String(card.content || '').trim();
      if (!content || !Number.isInteger(position) || positions.has(position)) {
        throw new Error('The puzzle contains an invalid word card.');
      }
      positions.add(position);
      return {
        id: String(position),
        position,
        content,
        categoryIndex,
      };
    });
    return {
      index: categoryIndex,
      title: String(category.title || '').trim(),
      cards,
    };
  });

  if (positions.size !== 16) throw new Error('The puzzle does not contain sixteen unique cards.');

  const cards = categories.flatMap(category => category.cards).sort((a, b) => a.position - b.position);
  return {
    id: Number(data.id),
    date: data.print_date || requestedDate,
    editor: data.editor || 'Wyna Liu',
    categories,
    cards,
  };
}

function progressKey() {
  // Keep standard-mode progress intact when trying easy mode.
  return `${STORAGE_PREFIX}:${state.date}${state.easyMode ? ':easy' : ''}`;
}

function saveProgress() {
  if (!state.puzzle) return;
  const progress = {
    wordOrder: state.wordOrder,
    solved: state.solved,
    mistakesRemaining: state.mistakesRemaining,
    guesses: state.guesses,
    guessCount: state.guesses.length,
    reveals: state.reveals,
    answersRevealed: state.answersRevealed,
    continuedFromStandard: state.continuedFromStandard,
    completed: state.completed,
    lost: state.lost,
  };
  const saved = writeStored(progressKey(), JSON.stringify(progress));
  dom.storageStatus.textContent = saved ? 'Progress saved on this browser.' : 'Couldn’t save progress. Keep this tab open; browser storage may be full or blocked.';
}

function restoreProgress() {
  const validIds = new Set(state.puzzle.cards.map(card => card.id));
  const defaultOrder = state.puzzle.cards.map(card => card.id);
  try {
    const saved = JSON.parse(readStored(progressKey()) || 'null');
    if (!saved) return;

    const storedOrder = Array.isArray(saved.wordOrder)
      ? saved.wordOrder.map(String).filter(id => validIds.has(id))
      : [];
    state.wordOrder = [...new Set([...storedOrder, ...defaultOrder])];
    state.solved = Array.isArray(saved.solved)
      ? [...new Set(saved.solved.filter(index => Number.isInteger(index) && index >= 0 && index < 4))]
      : [];
    state.mistakesRemaining = Number.isInteger(saved.mistakesRemaining)
      ? Math.max(0, Math.min(4, saved.mistakesRemaining))
      : 4;
    const seen = new Set();
    state.guesses = Array.isArray(saved.guesses) ? saved.guesses.filter(guess => {
      if (!Array.isArray(guess) || guess.length !== 4) return false;
      const ids = guess.map(String), key = guessKey(ids);
      if (new Set(ids).size !== 4 || ids.some(id => !validIds.has(id)) || seen.has(key)) return false;
      seen.add(key); return true;
    }).map(guess => guess.map(String)) : [];
    // Recover an accepted match even if an older version closed during its animation.
    state.guesses.forEach(guess => {
      const index = selectedCategoryCounts(guess).findIndex(count => count === 4);
      if (index !== -1 && !state.solved.includes(index)) state.solved.push(index);
    });
    const revealed = new Set();
    state.reveals = Array.isArray(saved.reveals) ? saved.reveals.filter(reveal => {
      if (!reveal || !Number.isInteger(reveal.categoryIndex) || reveal.categoryIndex < 0 || reveal.categoryIndex > 3 || revealed.has(reveal.categoryIndex)) return false;
      if (!Number.isInteger(reveal.afterGuess) || reveal.afterGuess < 0 || reveal.afterGuess > state.guesses.length) return false;
      revealed.add(reveal.categoryIndex); return true;
    }).map(({categoryIndex, afterGuess}) => ({categoryIndex, afterGuess})) : [];
    state.answersRevealed = saved.answersRevealed === true || (saved.answersRevealed === undefined && saved.lost === true);
    state.continuedFromStandard = state.easyMode && saved.continuedFromStandard === true;
    state.completed = state.solved.length === 4;
    state.lost = !state.easyMode && (Boolean(saved.lost) || state.mistakesRemaining === 0) && !state.completed;
  } catch (_) {
    removeStored(progressKey());
  }
}

function resetPuzzleState() {
  state.wordOrder = state.puzzle.cards.map(card => card.id);
  state.selected = new Set();
  state.solved = [];
  state.mistakesRemaining = 4;
  state.guesses = [];
  state.reveals = [];
  state.answersRevealed = false;
  state.continuedFromStandard = false;
  state.completed = false;
  state.lost = false;
  state.transitioning = false;
  dom.storageStatus.textContent = 'Guesses and category reveals are saved on this browser.';
}

function showLoading() {
  dom.loading.classList.remove('hidden');
  dom.error.classList.add('hidden');
  dom.game.classList.add('hidden');
  dom.resultOverlay.classList.add('hidden');
}

function showError(message) {
  dom.errorMessage.textContent = message;
  dom.loading.classList.add('hidden');
  dom.error.classList.remove('hidden');
  dom.game.classList.add('hidden');
}

async function loadPuzzle(dateId, updateUrl = true) {
  if (!isDateId(dateId)) return;
  const requestSequence = ++state.requestSequence;
  if (state.requestController) state.requestController.abort();
  state.requestController = new AbortController();
  showLoading();

  try {
    let puzzleData = null;

    if (state.archivedDates.has(dateId)) {
      const [year, month] = dateId.split('-');
      try {
        const archivedResponse = await fetch(`./puzzles/${year}/${month}/${dateId}.json`, {
          signal: state.requestController.signal,
        });
        if (archivedResponse.ok) puzzleData = await archivedResponse.json();
      } catch (error) {
        if (error.name === 'AbortError') throw error;
      }
    }

    if (!puzzleData) {
      const response = await fetch(`${CONNECTIONS_API}/${dateId}`, {
        signal: state.requestController.signal,
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error('No Connections puzzle was found for that date.');
        throw new Error(`The puzzle service returned HTTP ${response.status}.`);
      }
      puzzleData = await response.json();
    }

    const puzzle = parsePuzzle(puzzleData, dateId);
    if (requestSequence !== state.requestSequence) return;

    state.puzzle = puzzle;
    state.date = puzzle.date;
    resetPuzzleState();
    restoreProgress();
    syncPuzzleControls();
    render();
    dom.loading.classList.add('hidden');
    dom.error.classList.add('hidden');
    dom.game.classList.remove('hidden');
    if (updateUrl) updatePuzzleUrl();
    if (state.lost && !state.answersRevealed) showResult();
  } catch (error) {
    if (error.name === 'AbortError') return;
    showError(error.message || 'The puzzle service did not respond.');
  }
}

function syncPuzzleControls() {
  dom.puzzleDate.value = state.date;
  let matchingOption = [...dom.puzzleSelect.options].find(option => option.value === state.date);
  if (!matchingOption) {
    matchingOption = document.createElement('option');
    matchingOption.value = state.date;
    matchingOption.textContent = formatDate(state.date);
    dom.puzzleSelect.prepend(matchingOption);
  }
  dom.puzzleSelect.value = state.date;
  dom.puzzleAuthor.textContent = `Edited by ${state.puzzle.editor}`;
  dom.puzzleNumber.textContent = Number.isFinite(state.puzzle.id) ? `Puzzle #${state.puzzle.id}` : '';
  dom.dateLabel.textContent = formatDate(state.date);
}

function cardById(id) {
  return state.puzzle.cards.find(card => card.id === String(id));
}

function setStatus(message, kind = '') {
  dom.status.textContent = message;
  dom.status.className = `status-message${kind ? ` is-${kind}` : ''}`;
}

function renderSolvedGroups() {
  dom.solvedGroups.replaceChildren();
  const displayed = [...state.solved];
  if (state.lost && state.answersRevealed) {
    state.puzzle.categories.forEach(category => {
      if (!displayed.includes(category.index)) displayed.push(category.index);
    });
  }

  displayed.forEach(categoryIndex => {
    const category = state.puzzle.categories[categoryIndex];
    const group = document.createElement('section');
    const wasSolved = state.solved.includes(categoryIndex);
    group.className = `solved-group category-${categoryIndex}${wasSolved ? '' : ' revealed-group'}`;
    group.dataset.categoryIndex = String(categoryIndex);

    const title = document.createElement('h3');
    title.className = 'solved-group-title';
    title.textContent = category.title;
    const words = document.createElement('p');
    words.className = 'solved-group-words';
    words.textContent = category.cards.map(card => card.content).join(', ');
    group.append(title, words);
    dom.solvedGroups.appendChild(group);
  });
}

function renderWordGrid() {
  dom.wordGrid.replaceChildren();
  const gameOver = state.completed || (state.lost && state.answersRevealed);
  dom.wordGrid.classList.toggle('hidden', gameOver);
  if (gameOver) return;

  state.wordOrder.forEach(id => {
    const card = cardById(id);
    if (!card || state.solved.includes(card.categoryIndex)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'word-card';
    button.dataset.cardId = card.id;
    button.textContent = card.content;
    button.setAttribute('aria-pressed', state.selected.has(card.id) ? 'true' : 'false');
    button.addEventListener('click', () => toggleCard(card.id, button));
    dom.wordGrid.appendChild(button);
  });
}

function renderHistory() {
  dom.guessCount.textContent = String(state.guesses.length);
  dom.history.replaceChildren();
  state.guesses.forEach((guess, index) => {
    const best = Math.max(...selectedCategoryCounts(guess));
    if (best === 4) return;
    const row = document.createElement('li'); row.className = 'history-guess';
    const heading = document.createElement('div'); heading.className = 'history-guess-heading';
    const number = document.createElement('strong'); number.textContent = `Guess ${index + 1}`;
    const feedback = document.createElement('span'); feedback.textContent = best === 3 ? 'One away' : 'Not one away';
    heading.append(number, feedback);
    const words = document.createElement('ul'); words.className = 'history-words';
    guess.forEach(id => { const word = document.createElement('li'); word.textContent = cardById(id).content; words.append(word); });
    row.append(heading, words); dom.history.append(row);
  });
  dom.historyEmpty.classList.toggle('hidden', dom.history.children.length !== 0);
}

function revealCategory(index) {
  if (!state.puzzle || state.transitioning || state.completed || state.lost || state.solved.includes(index) || state.reveals.some(r => r.categoryIndex === index)) return;
  if (!Number.isInteger(index) || index < 0 || index > 3) return;
  state.reveals.push({categoryIndex:index, afterGuess:state.guesses.length});
  saveProgress(); renderReveals();
  setStatus(`${CATEGORY_NAMES[index]} category: ${state.puzzle.categories[index].title}`);
  dom.reveals.querySelector(`[data-reveal-index="${index}"] .hint-title`)?.focus();
}

function renderReveals() {
  dom.reveals.replaceChildren();
  state.puzzle.categories.forEach((category, index) => {
    const revealed = state.reveals.some(r => r.categoryIndex === index), solved = state.solved.includes(index);
    const row = document.createElement('li'); row.dataset.revealIndex = String(index);
    const heading = document.createElement('div'); heading.className = 'reveal-heading';
    const label = document.createElement('span'); label.className = 'reveal-colour';
    const swatch = document.createElement('span'); swatch.className = `category-swatch category-${index}`; swatch.setAttribute('aria-hidden', 'true');
    label.append(swatch, document.createTextNode(CATEGORY_NAMES[index])); heading.append(label);
    if (revealed || solved || state.answersRevealed) {
      const status = document.createElement('span'); status.className = 'hint-state'; status.textContent = revealed ? 'Revealed' : solved ? 'Found' : 'Game over'; heading.append(status);
      const title = document.createElement('p'); title.className = 'hint-title'; title.tabIndex = -1; title.textContent = category.title; row.append(heading, title);
    } else {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'hint-button'; button.textContent = 'Reveal'; button.setAttribute('aria-label', `Reveal ${CATEGORY_NAMES[index].toLowerCase()} category name`);
      button.disabled = state.transitioning || state.lost; button.onclick = () => revealCategory(index); heading.append(button); row.append(heading);
    }
    dom.reveals.append(row);
  });
}

function renderMistakes() {
  dom.mistakeDots.replaceChildren();
  dom.mistakeLabel.textContent = state.easyMode ? 'Easy mode: unlimited tries' : 'Mistakes remaining:';
  dom.mistakeDots.parentElement.setAttribute('aria-label', state.easyMode ? 'Unlimited tries' : `${state.mistakesRemaining} mistakes remaining`);
  if (state.easyMode) return;
  for (let count = 0; count < state.mistakesRemaining; count += 1) {
    const dot = document.createElement('span');
    dot.className = 'mistake-dot';
    dom.mistakeDots.appendChild(dot);
  }
}

function renderControls() {
  const gameOver = state.completed || state.lost;
  dom.game.setAttribute('aria-busy', state.transitioning ? 'true' : 'false');
  dom.puzzleSelect.disabled = state.transitioning;
  dom.puzzleDate.disabled = state.transitioning;
  dom.reset.disabled = state.transitioning;
  dom.easyMode.disabled = state.transitioning;
  dom.easyMode.checked = state.easyMode;
  dom.viewResults.classList.toggle('hidden', !gameOver);
  dom.viewResults.disabled = state.transitioning;
  dom.viewResults.textContent = state.lost && !state.answersRevealed ? 'Choose how to continue' : 'View / share results';
  document.getElementById('easy-mode-help').textContent = state.continuedFromStandard ? 'Unlimited tries · continuing your standard run' : 'Unlimited tries · separate saved progress';
  dom.reveals.querySelectorAll('button').forEach(button => { button.disabled = state.transitioning || gameOver; });
  dom.wordGrid.querySelectorAll('.word-card').forEach(card => {
    card.disabled = state.transitioning || gameOver;
  });
  dom.shuffle.disabled = state.transitioning || gameOver || state.wordOrder.filter(id => {
    const card = cardById(id);
    return card && !state.solved.includes(card.categoryIndex);
  }).length < 2;
  dom.deselect.disabled = state.transitioning || gameOver || state.selected.size === 0;
  dom.submit.disabled = state.transitioning || gameOver || state.selected.size !== 4;
  renderMistakes();
}

function render() {
  renderHistory();
  renderReveals();
  renderSolvedGroups();
  renderWordGrid();
  renderControls();
  if (state.completed) setStatus('Puzzle complete.', 'success');
  else if (state.lost) setStatus(state.answersRevealed ? 'The remaining groups are shown.' : 'Out of mistakes. Continue in easy mode or choose to reveal the answers.', 'error');
  else if (state.solved.length === 0) setStatus('Select four words that share a connection.');
  else setStatus(`${4 - state.solved.length} ${4 - state.solved.length === 1 ? 'group' : 'groups'} remaining.`);
}

function motionEnabled() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function finished(animation) {
  return animation.finished.catch(() => undefined);
}

function captureWordPositions() {
  const positions = new Map();
  dom.wordGrid.querySelectorAll('.word-card').forEach(card => {
    positions.set(card.dataset.cardId, card.getBoundingClientRect());
  });
  return positions;
}

function animateSelection(button) {
  if (!motionEnabled()) return;
  button.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(.94)', offset: .45 },
    { transform: 'scale(1)' },
  ], {
    duration: 160,
    easing: 'cubic-bezier(.2,.75,.35,1)',
  });
}

function animateMovedCards(previousPositions, duration = 320) {
  if (!motionEnabled()) return;
  dom.wordGrid.querySelectorAll('.word-card').forEach(card => {
    const previous = previousPositions.get(card.dataset.cardId);
    if (!previous) return;
    const current = card.getBoundingClientRect();
    const deltaX = previous.left - current.left;
    const deltaY = previous.top - current.top;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
    card.animate([
      { transform: `translate(${deltaX}px, ${deltaY}px)` },
      { transform: 'translate(0, 0)' },
    ], {
      duration,
      easing: 'cubic-bezier(.2,.8,.2,1)',
    });
  });
}

async function animateRejectedGuess(selectedIds) {
  if (!motionEnabled()) return;
  const animations = selectedIds.map((id, index) => {
    const card = dom.wordGrid.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
    if (!card) return Promise.resolve();
    return finished(card.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(0)' },
    ], {
      duration: 300,
      delay: index * 18,
      easing: 'ease-in-out',
    }));
  });
  await Promise.all(animations);
}

async function animateCorrectMatch(selectedIds, categoryIndex) {
  const previousPositions = captureWordPositions();
  const category = state.puzzle.categories[categoryIndex];
  const snapshots = category.cards.map(card => {
    const element = dom.wordGrid.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`);
    return element ? { element, rect: element.getBoundingClientRect(), clone: element.cloneNode(true) } : null;
  }).filter(Boolean);

  if (motionEnabled()) {
    await Promise.all(snapshots.map(({ element }, index) => finished(element.animate([
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-10px) scale(1.03)', offset: .48 },
      { transform: 'translateY(0) scale(1)' },
    ], {
      duration: 220,
      delay: index * 36,
      easing: 'cubic-bezier(.2,.75,.35,1)',
    }))));
  }

  state.selected.clear();
  render();

  if (!motionEnabled()) return;

  const group = dom.solvedGroups.querySelector(`[data-category-index="${categoryIndex}"]`);
  if (!group || snapshots.length !== 4) return;
  group.classList.add('is-forming');
  const target = group.getBoundingClientRect();
  const gap = 8;
  const targetWidth = (target.width - gap * 3) / 4;

  const cloneAnimations = snapshots.map(({ rect, clone }, index) => {
    clone.classList.add('formation-card');
    clone.removeAttribute('data-card-id');
    clone.setAttribute('aria-hidden', 'true');
    clone.tabIndex = -1;
    Object.assign(clone.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    document.body.appendChild(clone);
    const finalLeft = target.left + index * (targetWidth + gap);
    const animation = clone.animate([
      {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        opacity: 1,
        transform: 'scale(1)',
      },
      {
        left: `${finalLeft}px`,
        top: `${target.top}px`,
        width: `${targetWidth}px`,
        height: `${target.height}px`,
        opacity: 1,
        transform: 'scale(.98)',
        offset: .8,
      },
      {
        left: `${finalLeft}px`,
        top: `${target.top}px`,
        width: `${targetWidth}px`,
        height: `${target.height}px`,
        opacity: 0,
        transform: 'scale(.98)',
      },
    ], {
      duration: 340,
      delay: index * 28,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'forwards',
    });
    return finished(animation).then(() => clone.remove());
  });

  animateMovedCards(previousPositions, 360);
  await Promise.all(cloneAnimations);
  group.classList.remove('is-forming');
  await finished(group.animate([
    { opacity: 0, transform: 'scale(.985)' },
    { opacity: 1, transform: 'scale(1)' },
  ], {
    duration: 180,
    easing: 'ease-out',
  }));
}

async function animateLossReveal() {
  if (!motionEnabled()) return;
  const groups = [...dom.solvedGroups.querySelectorAll('.solved-group')];
  await Promise.all(groups.map((group, index) => finished(group.animate([
    { opacity: 0, transform: 'translateY(10px) scale(.985)' },
    { opacity: 1, transform: 'translateY(0) scale(1)' },
  ], {
    duration: 240,
    delay: index * 65,
    easing: 'cubic-bezier(.2,.8,.2,1)',
    fill: 'backwards',
  }))));
}

function toggleCard(cardId, button) {
  if (state.completed || state.lost || state.transitioning) return;
  if (state.selected.has(cardId)) {
    state.selected.delete(cardId);
    button.setAttribute('aria-pressed', 'false');
  } else {
    if (state.selected.size >= 4) {
      setStatus('You can select up to four words.', 'error');
      return;
    }
    state.selected.add(cardId);
    button.setAttribute('aria-pressed', 'true');
  }
  animateSelection(button);
  renderControls();
}

function shuffleWords() {
  if (state.transitioning || state.completed || state.lost) return;
  const previousPositions = captureWordPositions();
  const movableIndexes = [];
  const movableIds = [];
  state.wordOrder.forEach((id, index) => {
    const card = cardById(id);
    if (card && !state.solved.includes(card.categoryIndex)) {
      movableIndexes.push(index);
      movableIds.push(id);
    }
  });
  for (let index = movableIds.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [movableIds[index], movableIds[swapIndex]] = [movableIds[swapIndex], movableIds[index]];
  }
  movableIndexes.forEach((position, index) => { state.wordOrder[position] = movableIds[index]; });
  saveProgress();
  renderWordGrid();
  renderControls();
  animateMovedCards(previousPositions);
  setStatus('Words shuffled.');
}

function deselectAll() {
  if (state.transitioning || state.completed || state.lost) return;
  state.selected.clear();
  dom.wordGrid.querySelectorAll('.word-card').forEach(card => card.setAttribute('aria-pressed', 'false'));
  renderControls();
  setStatus('Selection cleared.');
}

function selectedCategoryCounts(selectedIds) {
  const counts = [0, 0, 0, 0];
  selectedIds.forEach(id => {
    const card = cardById(id);
    if (card) counts[card.categoryIndex] += 1;
  });
  return counts;
}

function guessKey(ids) {
  return [...ids].map(String).sort().join('|');
}

async function submitGuess() {
  if (state.selected.size !== 4 || state.completed || state.lost || state.transitioning) return;
  const selectedIds = [...state.selected];
  if (state.guesses.some(guess => guessKey(guess) === guessKey(selectedIds))) {
    setStatus('You already tried that group.', 'error');
    return;
  }

  const counts = selectedCategoryCounts(selectedIds);
  const categoryIndex = counts.findIndex(count => count === 4);
  state.guesses.push(selectedIds);

  if (categoryIndex !== -1 && !state.solved.includes(categoryIndex)) {
    state.solved.push(categoryIndex);
    state.completed = state.solved.length === 4;
    state.transitioning = true;
    saveProgress();
    renderHistory();
    renderControls();
    await animateCorrectMatch(selectedIds, categoryIndex);
    state.transitioning = false;
    renderControls();
    if (state.completed) showResult();
    else setStatus('Group found.', 'success');
    return;
  }

  state.transitioning = true;
  if (!state.easyMode) state.mistakesRemaining = Math.max(0, state.mistakesRemaining - 1);
  const oneAway = Math.max(...counts) === 3;
  state.lost = !state.easyMode && state.mistakesRemaining === 0;
  setStatus(oneAway ? 'One away…' : 'Not a group. Try again.', 'error');
  renderHistory();
  renderControls();
  saveProgress();
  await animateRejectedGuess(selectedIds);

  if (state.lost) {
    state.selected.clear();
    state.transitioning = false;
    render();
    showResult();
    return;
  }

  state.transitioning = false;
  renderControls();
}

function resultText() {
  const result = state.completed ? 'Solved' : 'Not solved';
  const used = state.guesses.filter(guess => Math.max(...selectedCategoryCounts(guess)) !== 4).length;
  return `${result}${state.easyMode ? ' in easy mode' : ''} with ${used} ${used === 1 ? 'mistake' : 'mistakes'}.`;
}

function showResult() {
  if (!state.completed && !state.lost) return;
  const offer = state.lost && !state.answersRevealed;
  dom.continueEasy.classList.toggle('hidden', !offer);
  dom.revealAnswers.classList.toggle('hidden', !offer);
  dom.resultCopy.classList.toggle('hidden', offer);
  dom.share.classList.toggle('hidden', offer);
  dom.resultBox.classList.toggle('is-loss', state.lost);
  dom.resultIcon.textContent = state.completed ? '✓' : '×';
  dom.resultTitle.textContent = offer ? 'Out of mistakes—not out of options' : state.completed ? 'Puzzle complete!' : 'Answers revealed';
  dom.resultSummary.textContent = offer ? 'Keep your found groups, guesses and hints and continue with unlimited tries. The remaining answers stay hidden unless you choose Reveal answers.' : `${formatDate(state.date)}. ${resultText()}`;
  dom.sharePreview.value = shareText();
  dom.shareStatus.textContent = '';
  dom.share.textContent = 'Copy results';
  dom.resultOverlay.classList.remove('hidden');
  if (motionEnabled()) {
    dom.resultOverlay.animate([
      { opacity: 0 },
      { opacity: 1 },
    ], {
      duration: 160,
      easing: 'ease-out',
    });
    dom.resultBox.animate([
      { opacity: 0, transform: 'translateY(10px) scale(.97)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], {
      duration: 220,
      easing: 'cubic-bezier(.2,.8,.2,1)',
    });
  }
  (offer ? dom.continueEasy : dom.share).focus();
}

function continueInEasyMode() {
  if (state.easyMode || !state.lost || state.answersRevealed || state.transitioning) return;
  let existing = null;
  try { existing = JSON.parse(readStored(`${STORAGE_PREFIX}:${state.date}:easy`) || 'null'); } catch (_) { /* Replace invalid saved data. */ }
  if (existing && (existing.guesses?.length || existing.solved?.length || existing.reveals?.length) && !confirm('Replace your saved easy-mode attempt for this date with this standard-mode run? Your standard attempt will remain saved.')) {
    dom.easyMode.checked = false; return;
  }
  saveProgress();
  state.easyMode = true; state.lost = false; state.continuedFromStandard = true;
  state.selected.clear();
  writeStored(`${STORAGE_PREFIX}:easy-mode`, '1');
  saveProgress(); updatePuzzleUrl();
  dom.resultOverlay.classList.add('hidden'); render();
  setStatus('Continuing in easy mode. Your groups, guesses and category reveals are kept.', 'success');
  dom.easyMode.focus();
}

async function revealRemainingAnswers() {
  if (!state.lost || state.answersRevealed || state.transitioning) return;
  state.answersRevealed = true; state.transitioning = true;
  saveProgress(); dom.resultOverlay.classList.add('hidden'); render();
  await animateLossReveal(); state.transitioning = false; renderControls(); showResult();
}

function puzzleUrl(origin = 'https://puzzle.seall.dev') {
  const url = new URL('/connections-nyt/', origin);
  url.searchParams.set('date', state.date);
  url.searchParams.set('mode', state.easyMode ? 'easy' : 'standard');
  return url;
}

function updatePuzzleUrl() {
  const url = puzzleUrl(location.origin);
  history.replaceState(null, '', url.pathname + url.search);
}

function shareText() {
  // No colour breakdown / hidden-answer spoilers in the pre-reveal loss offer.
  if (!state.completed && !(state.lost && state.answersRevealed)) return '';
  const number = Number.isFinite(state.puzzle.id) ? ` #${state.puzzle.id}` : '';
  const lines = [], hints = afterGuess => state.reveals.filter(r => r.afterGuess === afterGuess).forEach(r => lines.push(`💡${CATEGORY_EMOJI[r.categoryIndex]} Category name revealed`));
  hints(0);
  state.guesses.forEach((guess, index) => {
    lines.push(guess.map(id => CATEGORY_EMOJI[cardById(id).categoryIndex]).join(''));
    hints(index + 1);
  });
  const reveals = state.reveals.length ? state.reveals.map(r => CATEGORY_EMOJI[r.categoryIndex]).join('') : 'None';
  return [
    `Connections${number} — ${state.date}`,
    `${state.easyMode ? `Easy mode${state.continuedFromStandard ? ' (continued from standard)' : ''} · Unlimited tries` : 'Standard mode'} · ${state.guesses.length} ${state.guesses.length === 1 ? 'guess' : 'guesses'}`,
    resultText(), `Category reveals: ${reveals} (names only)`, '', ...lines, '',
    `Found order: ${state.solved.map(index => CATEGORY_EMOJI[index]).join('') || 'None'} (${state.solved.length}/4)`,
    ...(state.lost ? ['Remaining answers revealed by choice after the fourth mistake.'] : []),
    `Play: ${puzzleUrl()}`,
  ].join('\n');
}

async function copyResults() {
  const text = shareText();
  if (!text) return;
  dom.share.textContent = 'Copy results';
  dom.shareStatus.textContent = '';
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    dom.sharePreview.focus(); dom.sharePreview.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { /* Manual copy remains available. */ }
    if (!copied) { dom.shareStatus.textContent = 'Copy was blocked. The text is selected—copy it manually.'; return; }
  }
  dom.shareStatus.textContent = 'Results copied. Paste them into a message.';
  dom.share.textContent = 'Copied!';
}

function resetCurrentPuzzle() {
  if (!state.puzzle || state.transitioning || !window.confirm('Reset this puzzle and erase its saved progress?')) return;
  removeStored(progressKey());
  resetPuzzleState();
  saveProgress();
  dom.resultOverlay.classList.add('hidden');
  render();
}

function applyTheme(theme) { window.PuzzleTheme.setPreference(theme); }

dom.puzzleSelect.addEventListener('change', () => loadPuzzle(dom.puzzleSelect.value));
dom.puzzleDate.addEventListener('change', () => {
  if (dom.puzzleDate.value) loadPuzzle(dom.puzzleDate.value);
});
dom.retry.addEventListener('click', () => loadPuzzle(state.date || dom.puzzleDate.value || localDateId(), false));
dom.shuffle.addEventListener('click', shuffleWords);
dom.deselect.addEventListener('click', deselectAll);
dom.submit.addEventListener('click', submitGuess);
dom.reset.addEventListener('click', resetCurrentPuzzle);
dom.easyMode.addEventListener('change', () => {
  if (!state.puzzle || state.transitioning) return;
  saveProgress();
  if (dom.easyMode.checked && state.lost && !state.answersRevealed) { continueInEasyMode(); return; }
  state.easyMode = dom.easyMode.checked;
  writeStored(`${STORAGE_PREFIX}:easy-mode`, state.easyMode ? '1' : '0');
  resetPuzzleState();
  restoreProgress();
  dom.resultOverlay.classList.add('hidden');
  updatePuzzleUrl();
  render();
});
dom.viewResults.addEventListener('click', showResult);
dom.continueEasy.addEventListener('click', continueInEasyMode);
dom.revealAnswers.addEventListener('click', revealRemainingAnswers);
dom.resultClose.addEventListener('click', () => {
  dom.resultOverlay.classList.add('hidden');
  dom.viewResults.focus();
});
dom.share.addEventListener('click', copyResults);
dom.resultOverlay.addEventListener('click', event => {
  if (event.target === dom.resultOverlay) dom.resultClose.click();
});

document.addEventListener('keydown', event => {
  if (!dom.resultOverlay.classList.contains('hidden')) {
    if (event.key === 'Escape') { event.preventDefault(); dom.resultClose.click(); }
    if (event.key === 'Tab') {
      const focusable = [dom.continueEasy, dom.revealAnswers, dom.sharePreview, dom.share, dom.resultClose].filter(el => el.getClientRects().length);
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && (index === focusable.length - 1 || index === -1)) { event.preventDefault(); focusable[0].focus(); }
    }
    return;
  }
  if (event.key === 'Escape') {
    if (!dom.resultOverlay.classList.contains('hidden')) dom.resultClose.click();
    else if (state.selected.size) deselectAll();
    return;
  }
  if (event.key === 'Enter' && state.selected.size === 4) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'INPUT') submitGuess();
  }
});

async function boot() {
  const archivedDates = await loadArchiveManifest();
  state.archivedDates = new Set(archivedDates);
  populatePuzzleSelector(archivedDates);
  const today = localDateId();
  dom.puzzleDate.max = today;
  const requested = new URLSearchParams(window.location.search).get('date');
  const initialDate = isDateId(requested) && requested <= today ? requested : today;
  state.date = initialDate;
  dom.puzzleDate.value = initialDate;
  loadPuzzle(initialDate, false);
}

boot();
