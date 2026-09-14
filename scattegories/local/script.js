(() => {
  "use strict";

  const STORAGE_KEY = "scattegories-v1";
  const DEFAULT_SECONDS = 150;
  const VALID_LETTERS = "ABCDEFGHIJKLMNOPRST".split("");
  const SAFE_CATEGORIES = [
    "Animals", "Things at the beach", "School subjects", "Breakfast foods", "Cartoon characters",
    "Things that are blue", "Musical instruments", "Board games", "Things in a kitchen", "Flowers",
    "Countries", "Things with wheels", "Sports", "Fruits", "Vegetables", "Things in the sky",
    "Things at a birthday party", "Book characters", "Things that are cold", "Things in a park",
    "Ice cream flavours", "Jobs", "Things in a backpack", "Types of weather", "Things at the zoo",
    "Toys", "Things you can draw", "Things made of wood", "Sea creatures", "Things that fly",
    "Things in a classroom", "Superheroes", "Things that are soft", "Things with buttons", "Birds",
    "Things on a farm", "Pizza toppings", "Things you wear", "Things that bounce", "Desserts",
    "Things in a garden", "Games", "Things that make noise", "Things under a bed", "Sandwich fillings",
    "Things that are green", "Things in a lunchbox", "Things with tails", "Things at a carnival", "Dinosaurs",
    "Things found in space", "Things you collect", "Things that are round", "Things in a library", "Trees",
    "Things you do after school", "Things made of metal", "Things that smell nice", "Things at a sleepover", "Reptiles",
    "Things with stripes", "Things in a toy shop", "Things that sparkle", "Things at the pool", "Fairy-tale characters",
    "Things that come in pairs", "Things in a pencil case", "Things with spots", "Things you build", "Outdoor activities",
    "Things in a story", "Things that are tiny", "Things in the ocean", "Things at a picnic", "Types of transport",
    "Things that are loud", "Things you can climb", "Things at a museum", "Things that melt", "Pets"
  ];
  const GENERAL_CATEGORIES = [
    "Movie titles", "Television shows", "Famous people", "Cities", "Restaurants", "Song titles",
    "Things in an office", "Reasons to be late", "Things people complain about", "Holiday destinations",
    "Things in a hotel", "Apps and websites", "Things at a concert", "Historical figures", "Car brands",
    "Things in a toolbox", "Things at a wedding", "Ways to spend a weekend", "Words associated with money", "Things in a hospital",
    "Things in a supermarket", "Things people save", "Things you plug in", "Things with a screen", "Things in a suitcase",
    "Things at an airport", "Things people lose", "Things in a bathroom", "Things at a gym", "Things on a menu",
    "Things people celebrate", "Things in the news", "Things found underground", "Things in a garage", "Things on a desk",
    "Things that need batteries", "Things in a waiting room", "Things people borrow", "Famous landmarks", "Things at a festival",
    "Things people queue for", "Things in a medicine cabinet", "Ways to relax", "Things at a market", "Things that are expensive",
    "Things people repair", "Things in a café", "Things that are fragile", "Things people forget", "Things in a theatre",
    "Things at a train station", "Things with a password", "Things people recycle", "Things in a courtroom", "Things on a road trip",
    "Things that are sticky", "Things in a workshop", "Things people measure", "Things at a sports match", "Things with a handle",
    "Things in a photograph", "Things people subscribe to", "Things in a drawer", "Things you should not touch", "Things with a warning label",
    "Things people do at work", "Things in a city", "Things at night", "Things people share", "Things that are spicy",
    "Things with a deadline", "Things people order online", "Things at a conference", "Things with a map", "Things people insure",
    "Things found on a receipt", "Things that need charging", "Things in a shed", "Things people return", "Things at a parade"
  ];
  const DEFAULT_CATEGORIES = [
    ...SAFE_CATEGORIES.map((name) => ({ name, kidSafe: true })),
    ...GENERAL_CATEGORIES.map((name) => ({ name, kidSafe: false }))
  ];
  const PALETTES = [
    ["#f2c94c", "#171717"],
    ["#ff7f66", "#171717"],
    ["#8bd3dd", "#171717"],
    ["#b8e986", "#171717"],
    ["#c8b6ff", "#171717"],
    ["#ffb4d0", "#171717"]
  ];

  const els = {
    letter: document.querySelector("#current-letter"),
    rerollLetter: document.querySelector("#reroll-letter"),
    timer: document.querySelector("#timer-display"),
    editTime: document.querySelector("#edit-time"),
    timeForm: document.querySelector("#time-form"),
    timeSeconds: document.querySelector("#time-seconds"),
    playToggle: document.querySelector("#play-toggle"),
    playState: document.querySelector("#play-state"),
    list: document.querySelector("#category-list"),
    count: document.querySelector("#category-count"),
    decrease: document.querySelector("#decrease-count"),
    increase: document.querySelector("#increase-count"),
    restart: document.querySelector("#restart-game"),
    listDialog: document.querySelector("#list-dialog"),
    listForm: document.querySelector("#list-form"),
    openListEditor: document.querySelector("#open-list-editor"),
    editor: document.querySelector("#category-editor"),
    kidFriendly: document.querySelector("#kid-friendly"),
    restoreDefaults: document.querySelector("#restore-defaults"),
    copyListLink: document.querySelector("#copy-list-link"),
    aboutDialog: document.querySelector("#about-dialog"),
    openAbout: document.querySelector("#open-about"),
    invertColors: document.querySelector("#invert-colors"),
    changeColors: document.querySelector("#change-colors"),
    timesUp: document.querySelector("#times-up-panel"),
    toast: document.querySelector("#toast")
  };
  els.concealed = document.querySelector("#categories-concealed");

  const state = {
    initialSeconds: DEFAULT_SECONDS,
    currentSeconds: DEFAULT_SECONDS,
    count: 12,
    categories: DEFAULT_CATEGORIES.map(({ name }) => name),
    roundCategories: [],
    currentLetter: "A",
    status: "ready",
    timerId: null,
    palette: 0,
    inverted: false,
    revealed: false
  };
  let toastTimer = null;
  let finishAnimationTimer = null;
  let playAnimationTimer = null;
  let revealAnimationTimer = null;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function parseLines(value) {
    const seen = new Set();
    return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => {
      const key = line.toLocaleLowerCase();
      if (!line || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 300);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        initialSeconds: state.initialSeconds,
        count: state.count,
        categories: state.categories,
        palette: state.palette,
        inverted: state.inverted,
        timerDefaultVersion: 2
      }));
    } catch {
      // The game remains fully playable when storage is unavailable.
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const savedSeconds = Number(saved.initialSeconds);
      const shouldMigrateDefault = saved.timerDefaultVersion !== 2 && savedSeconds === 120;
      state.initialSeconds = clamp(shouldMigrateDefault ? DEFAULT_SECONDS : savedSeconds || DEFAULT_SECONDS, 10, 3600);
      state.count = clamp(Number(saved.count) || 12, 1, 24);
      if (Array.isArray(saved.categories) && saved.categories.length) {
        state.categories = parseLines(saved.categories.join("\n"));
      }
      state.palette = clamp(Number(saved.palette) || 0, 0, PALETTES.length - 1);
      state.inverted = Boolean(saved.inverted);
    } catch {
      // Invalid saved data is ignored in favour of defaults.
    }
    state.currentSeconds = state.initialSeconds;
  }

  function encodeShareData(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function decodeShareData(value) {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
  }

  function loadSharedList() {
    if (!location.hash.startsWith("#list=")) return;
    try {
      const shared = decodeShareData(location.hash.slice(6));
      const categories = parseLines(Array.isArray(shared.categories) ? shared.categories.join("\n") : "");
      if (!categories.length) throw new Error("Empty list");
      state.categories = categories;
      state.initialSeconds = clamp(Number(shared.seconds) || DEFAULT_SECONDS, 10, 3600);
      state.currentSeconds = state.initialSeconds;
      state.count = clamp(Number(shared.count) || 12, 1, Math.min(24, categories.length));
      showToast("Shared category list loaded");
    } catch {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      showToast("That shared list could not be read");
    }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
  }

  function applyPalette() {
    const [accent, accentInk] = PALETTES[state.palette];
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-ink", accentInk);
    document.documentElement.dataset.inverted = String(state.inverted);
  }

  function formatTime(seconds) {
    return `${seconds} s`;
  }

  function renderTimer() {
    els.timer.textContent = formatTime(state.currentSeconds);
    document.title = state.status === "running"
      ? `${formatTime(state.currentSeconds)} — Scattegories`
      : "Scattegories — seall.dev";
  }

  function renderControls() {
    els.letter.textContent = state.currentLetter;
    els.count.textContent = String(state.count);
    els.decrease.disabled = state.count <= 1;
    els.increase.disabled = state.count >= Math.min(24, state.categories.length);
    els.playToggle.dataset.state = state.status;
    if (state.status === "running") {
      els.playState.textContent = "Pause";
      els.playToggle.setAttribute("aria-label", "Pause timer");
    } else if (state.status === "done") {
      els.playState.textContent = "Again";
      els.playToggle.setAttribute("aria-label", "Start another round");
    } else {
      els.playState.textContent = "Start";
      els.playToggle.setAttribute("aria-label", "Start timer");
    }
    renderTimer();
  }

  function renderCategories(animate = false) {
    els.list.replaceChildren();
    if (!state.roundCategories.length) {
      const empty = document.createElement("li");
      empty.textContent = "Add at least one category to begin.";
      els.list.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    state.roundCategories.forEach((category, index) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.className = "category-name";
      label.textContent = category;
      label.title = category;
      label.style.setProperty("--redaction-width", `${clamp(90 + category.length * 7, 145, 390)}px`);
      item.append(label);
      item.style.setProperty("--item-index", index);
      if (animate) {
        item.classList.add("is-entering");
        item.addEventListener("animationend", () => item.classList.remove("is-entering"), { once: true });
      }
      fragment.append(item);
    });
    els.list.append(fragment);
    els.list.style.setProperty("--category-count", String(Math.max(1, state.roundCategories.length)));
    els.list.classList.toggle("is-dense", state.roundCategories.length > 12);
  }

  function renderRoundVisibility() {
    els.list.classList.toggle("is-concealed", !state.revealed);
    els.list.setAttribute("aria-hidden", String(!state.revealed));
    els.concealed.hidden = state.revealed;
  }

  function animatePlayStart() {
    clearTimeout(playAnimationTimer);
    els.playToggle.classList.remove("is-starting");
    void els.playToggle.offsetWidth;
    els.playToggle.classList.add("is-starting");
    playAnimationTimer = setTimeout(() => {
      els.playToggle.classList.remove("is-starting");
      playAnimationTimer = null;
    }, 460);
  }

  function animateCategoryReveal() {
    clearTimeout(revealAnimationTimer);
    els.list.classList.remove("is-revealing");
    void els.list.offsetWidth;
    els.list.classList.add("is-revealing");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 20 : Math.max(380, (state.roundCategories.length - 1) * 24 + 360);
    revealAnimationTimer = setTimeout(() => {
      els.list.classList.remove("is-revealing");
      revealAnimationTimer = null;
    }, duration);
  }

  function randomLetter() {
    let next = state.currentLetter;
    while (VALID_LETTERS.length > 1 && next === state.currentLetter) {
      next = VALID_LETTERS[Math.floor(Math.random() * VALID_LETTERS.length)];
    }
    state.currentLetter = next;
    renderControls();
  }

  function generateRound(animate = false) {
    const count = Math.min(state.count, state.categories.length);
    state.roundCategories = shuffle(state.categories).slice(0, count);
    renderCategories(animate);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function resetFinishState() {
    clearTimeout(finishAnimationTimer);
    finishAnimationTimer = null;
    els.list.hidden = false;
    els.list.classList.remove("is-clearing");
    els.timesUp.hidden = true;
  }

  function soundBell() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(330, context.currentTime + 0.45);
      gain.gain.setValueAtTime(0.16, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.5);
    } catch {
      // Audio feedback is optional.
    }
  }

  function finishTimer() {
    stopTimer();
    state.currentSeconds = 0;
    state.status = "done";
    soundBell();
    renderControls();
    els.list.setAttribute("aria-hidden", "false");
    els.list.classList.add("is-clearing");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animationDuration = reducedMotion ? 20 : Math.max(320, (state.roundCategories.length - 1) * 45 + 320);
    finishAnimationTimer = setTimeout(() => {
      els.list.classList.remove("is-clearing");
      els.timesUp.hidden = false;
      finishAnimationTimer = null;
    }, animationDuration);
  }

  function startTimer() {
    if (!state.categories.length) {
      showToast("Add a category before starting");
      return;
    }
    if (state.status === "done" || state.currentSeconds <= 0) restartRound();
    state.revealed = true;
    renderRoundVisibility();
    animatePlayStart();
    animateCategoryReveal();
    state.status = "running";
    stopTimer();
    state.timerId = setInterval(() => {
      state.currentSeconds -= 1;
      if (state.currentSeconds <= 0) finishTimer();
      else renderTimer();
    }, 1000);
    renderControls();
  }

  function pauseTimer() {
    stopTimer();
    state.status = "paused";
    renderControls();
  }

  function restartRound() {
    stopTimer();
    resetFinishState();
    state.status = "ready";
    state.revealed = false;
    state.currentSeconds = state.initialSeconds;
    randomLetter();
    generateRound(true);
    renderRoundVisibility();
    renderControls();
  }

  function updateCount(delta) {
    state.count = clamp(state.count + delta, 1, Math.min(24, state.categories.length));
    generateRound(true);
    renderControls();
    saveState();
  }

  function openListEditor() {
    els.editor.value = state.categories.join("\n");
    els.listDialog.showModal();
    requestAnimationFrame(() => els.editor.focus());
  }

  function saveEditorList() {
    const categories = parseLines(els.editor.value);
    if (!categories.length) {
      showToast("Keep at least one category in the list");
      return false;
    }
    state.categories = categories;
    state.count = clamp(state.count, 1, Math.min(24, categories.length));
    saveState();
    restartRound();
    showToast(`${categories.length} categories saved`);
    return true;
  }

  async function copyShareLink() {
    const categories = parseLines(els.editor.value);
    if (!categories.length) {
      showToast("Add a category before sharing");
      return;
    }
    const hash = encodeShareData({
      v: 1,
      seconds: state.initialSeconds,
      count: Math.min(state.count, categories.length),
      categories
    });
    const url = `${location.origin}${location.pathname}#list=${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied");
    } catch {
      location.hash = `list=${hash}`;
      showToast("Share link added to the address bar");
    }
  }

  els.rerollLetter.addEventListener("click", randomLetter);
  els.playToggle.addEventListener("click", () => {
    if (state.status === "running") pauseTimer();
    else startTimer();
  });
  els.restart.addEventListener("click", restartRound);
  els.decrease.addEventListener("click", () => updateCount(-1));
  els.increase.addEventListener("click", () => updateCount(1));
  els.editTime.addEventListener("click", () => {
    if (state.status === "running") pauseTimer();
    els.timeForm.classList.toggle("hidden");
    els.timer.classList.toggle("hidden", !els.timeForm.classList.contains("hidden"));
    els.timeSeconds.value = String(state.initialSeconds);
    if (!els.timeForm.classList.contains("hidden")) els.timeSeconds.focus();
  });
  els.timeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    resetFinishState();
    state.initialSeconds = clamp(Number(els.timeSeconds.value) || DEFAULT_SECONDS, 10, 3600);
    state.currentSeconds = state.initialSeconds;
    state.status = "ready";
    state.revealed = false;
    els.timeForm.classList.add("hidden");
    els.timer.classList.remove("hidden");
    saveState();
    renderRoundVisibility();
    renderControls();
  });
  els.openListEditor.addEventListener("click", openListEditor);
  els.listDialog.addEventListener("close", () => {
    if (els.listDialog.returnValue === "default" && !saveEditorList()) openListEditor();
  });
  els.kidFriendly.addEventListener("click", () => {
    const safe = new Set(SAFE_CATEGORIES.map((category) => category.toLocaleLowerCase()));
    const current = parseLines(els.editor.value);
    const custom = current.filter((category) => {
      const knownDefault = DEFAULT_CATEGORIES.some(({ name }) => name.toLocaleLowerCase() === category.toLocaleLowerCase());
      return !knownDefault || safe.has(category.toLocaleLowerCase());
    });
    els.editor.value = custom.join("\n");
    showToast("Adult-oriented defaults removed");
  });
  els.restoreDefaults.addEventListener("click", () => {
    els.editor.value = DEFAULT_CATEGORIES.map(({ name }) => name).join("\n");
    showToast("Default list restored in the editor");
  });
  els.copyListLink.addEventListener("click", copyShareLink);
  els.openAbout.addEventListener("click", () => els.aboutDialog.showModal());
  els.invertColors.addEventListener("click", () => {
    state.inverted = !state.inverted;
    applyPalette();
    saveState();
  });
  els.changeColors.addEventListener("click", () => {
    state.palette = (state.palette + 1) % PALETTES.length;
    applyPalette();
    saveState();
  });
  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || document.querySelector("dialog[open]")) return;
    if (event.code === "Space") {
      event.preventDefault();
      els.playToggle.click();
    }
    if (event.key.toLocaleLowerCase() === "r") restartRound();
  });
  window.addEventListener("beforeunload", () => {
    stopTimer();
    clearTimeout(finishAnimationTimer);
    clearTimeout(playAnimationTimer);
    clearTimeout(revealAnimationTimer);
  });

  loadState();
  loadSharedList();
  applyPalette();
  randomLetter();
  generateRound();
  renderRoundVisibility();
  renderControls();
})();
