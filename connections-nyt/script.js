'use strict';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const CONNECTIONS_API = window.CONNECTIONS_API_BASE || (
  LOCAL_HOSTS.has(window.location.hostname)
    ? '/api/nyt/connections'
    : 'https://nyt-crossword-proxy.my-account-306.workers.dev/nyt/connections'
);
const STORAGE_PREFIX = 'nyt-connections-v1';
const CATEGORY_EMOJI = ['🟨', '🟩', '🟦', '🟪'];

const state = {
  puzzle: null,
  date: '',
  archivedDates: new Set(),
  wordOrder: [],
  selected: new Set(),
  solved: [],
  mistakesRemaining: 4,
  guesses: [],
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
  shuffle: document.getElementById('shuffle-button'),
  deselect: document.getElementById('deselect-button'),
  submit: document.getElementById('submit-button'),
  reset: document.getElementById('reset-button'),
  resultOverlay: document.getElementById('result-overlay'),
  resultBox: document.querySelector('.result-box'),
  resultIcon: document.getElementById('result-icon'),
  resultTitle: document.getElementById('result-title'),
  resultSummary: document.getElementById('result-summary'),
  share: document.getElementById('share-button'),
  resultClose: document.getElementById('result-close'),
  themeToggle: document.getElementById('btn-theme-toggle'),
  iconSun: document.getElementById('icon-sun'),
  iconMoon: document.getElementById('icon-moon'),
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
  const dates = [...new Set([...recentDates(90), ...archivedDates])]
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
  return `${STORAGE_PREFIX}:${state.date}`;
}

function saveProgress() {
  if (!state.puzzle) return;
  const progress = {
    wordOrder: state.wordOrder,
    solved: state.solved,
    mistakesRemaining: state.mistakesRemaining,
    guesses: state.guesses,
    completed: state.completed,
    lost: state.lost,
  };
  localStorage.setItem(progressKey(), JSON.stringify(progress));
}

function restoreProgress() {
  const validIds = new Set(state.puzzle.cards.map(card => card.id));
  const defaultOrder = state.puzzle.cards.map(card => card.id);
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey()) || 'null');
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
    state.guesses = Array.isArray(saved.guesses)
      ? saved.guesses.filter(guess => Array.isArray(guess) && guess.length === 4)
      : [];
    state.completed = Boolean(saved.completed) && state.solved.length === 4;
    state.lost = Boolean(saved.lost) && !state.completed;
  } catch (_) {
    localStorage.removeItem(progressKey());
  }
}

function resetPuzzleState() {
  state.wordOrder = state.puzzle.cards.map(card => card.id);
  state.selected = new Set();
  state.solved = [];
  state.mistakesRemaining = 4;
  state.guesses = [];
  state.completed = false;
  state.lost = false;
  state.transitioning = false;
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
    if (updateUrl) history.replaceState(null, '', `?date=${encodeURIComponent(state.date)}`);
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
  if (state.lost) {
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
  const gameOver = state.completed || state.lost;
  dom.wordGrid.classList.toggle('hidden', gameOver);
  if (gameOver) return;

  state.wordOrder.forEach(id => {
    const card = cardById(id);
    if (!card || state.solved.includes(card.categoryIndex)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `word-card${card.content.length > 12 ? ' is-long' : ''}`;
    button.dataset.cardId = card.id;
    button.textContent = card.content;
    button.setAttribute('aria-pressed', state.selected.has(card.id) ? 'true' : 'false');
    button.addEventListener('click', () => toggleCard(card.id, button));
    dom.wordGrid.appendChild(button);
  });
}

function renderMistakes() {
  dom.mistakeDots.replaceChildren();
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
  renderSolvedGroups();
  renderWordGrid();
  renderControls();
  if (state.completed) setStatus('Puzzle complete.', 'success');
  else if (state.lost) setStatus('The remaining groups are shown.', 'error');
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

  state.solved.push(categoryIndex);
  state.selected.clear();
  if (state.solved.length === 4) state.completed = true;
  saveProgress();
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
    state.transitioning = true;
    renderControls();
    await animateCorrectMatch(selectedIds, categoryIndex);
    state.transitioning = false;
    renderControls();
    if (state.completed) showResult();
    else setStatus('Group found.', 'success');
    return;
  }

  state.transitioning = true;
  state.mistakesRemaining = Math.max(0, state.mistakesRemaining - 1);
  const oneAway = Math.max(...counts) === 3;
  setStatus(oneAway ? 'One away…' : 'Not a group. Try again.', 'error');
  renderControls();
  saveProgress();
  await animateRejectedGuess(selectedIds);

  if (state.mistakesRemaining === 0) {
    if (motionEnabled()) {
      await Promise.all([...dom.wordGrid.querySelectorAll('.word-card')].map((card, index) => finished(card.animate([
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(.97)' },
      ], {
        duration: 150,
        delay: Math.min(index, 7) * 12,
        easing: 'ease-in',
        fill: 'forwards',
      }))));
    }
    state.lost = true;
    state.selected.clear();
    saveProgress();
    render();
    await animateLossReveal();
    state.transitioning = false;
    renderControls();
    showResult();
    return;
  }

  state.transitioning = false;
  renderControls();
}

function resultText() {
  const result = state.completed ? 'Solved' : 'Not solved';
  const used = 4 - state.mistakesRemaining;
  return `${result} with ${used} ${used === 1 ? 'mistake' : 'mistakes'}.`;
}

function showResult() {
  dom.resultBox.classList.toggle('is-loss', state.lost);
  dom.resultIcon.textContent = state.completed ? '✓' : '×';
  dom.resultTitle.textContent = state.completed ? 'Puzzle complete!' : 'Better luck next time';
  dom.resultSummary.textContent = `${formatDate(state.date)}. ${resultText()}`;
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
  dom.share.focus();
}

function shareText() {
  const number = Number.isFinite(state.puzzle.id) ? ` #${state.puzzle.id}` : '';
  const lines = state.guesses.map(guess => guess.map(id => {
    const card = cardById(id);
    return CATEGORY_EMOJI[card ? card.categoryIndex : 0];
  }).join(''));
  return [`Connections${number}`, ...lines].join('\n');
}

async function copyResults() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  dom.share.textContent = 'Copied!';
  window.setTimeout(() => { dom.share.textContent = 'Share results'; }, 1400);
}

function resetCurrentPuzzle() {
  if (!state.puzzle || state.transitioning || !window.confirm('Reset this puzzle and erase its saved progress?')) return;
  localStorage.removeItem(progressKey());
  resetPuzzleState();
  render();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('xw-theme', theme);
  dom.iconSun.hidden = theme !== 'light';
  dom.iconMoon.hidden = theme === 'light';
}

dom.puzzleSelect.addEventListener('change', () => loadPuzzle(dom.puzzleSelect.value));
dom.puzzleDate.addEventListener('change', () => {
  if (dom.puzzleDate.value) loadPuzzle(dom.puzzleDate.value);
});
dom.retry.addEventListener('click', () => loadPuzzle(state.date || dom.puzzleDate.value || localDateId(), false));
dom.shuffle.addEventListener('click', shuffleWords);
dom.deselect.addEventListener('click', deselectAll);
dom.submit.addEventListener('click', submitGuess);
dom.reset.addEventListener('click', resetCurrentPuzzle);
dom.resultClose.addEventListener('click', () => {
  dom.resultOverlay.classList.add('hidden');
  dom.reset.focus();
});
dom.share.addEventListener('click', copyResults);
dom.resultOverlay.addEventListener('click', event => {
  if (event.target === dom.resultOverlay) dom.resultClose.click();
});
dom.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

document.addEventListener('keydown', event => {
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
  dom.puzzleDate.max = localDateId();
  applyTheme(localStorage.getItem('xw-theme') || 'light');
  const requested = new URLSearchParams(window.location.search).get('date');
  const initialDate = isDateId(requested) ? requested : localDateId();
  state.date = initialDate;
  dom.puzzleDate.value = initialDate;
  loadPuzzle(initialDate, false);
}

boot();
