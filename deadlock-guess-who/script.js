(() => {
  "use strict";

  const STORAGE_KEY = "guess-who-v1:deadlock";
  const MOBILE_PANEL_QUERY = "(max-width: 720px)";
  const SHOWCASE_ASSET_VERSION = "2";

  const els = {
    loadingView: document.querySelector("#loading-view"),
    errorView: document.querySelector("#error-view"),
    errorMessage: document.querySelector("#error-message"),
    retryButton: document.querySelector("#retry-button"),
    gameView: document.querySelector("#game-view"),
    remainingCount: document.querySelector("#remaining-count"),
    remainingLabel: document.querySelector("#remaining-label"),
    resetBoard: document.querySelector("#reset-board"),
    secretDock: document.querySelector("#secret-dock"),
    secretPeek: document.querySelector("#secret-peek"),
    secretContent: document.querySelector("#secret-content"),
    clearSecret: document.querySelector("#clear-secret"),
    secretSetup: document.querySelector("#secret-setup"),
    secretRandomStart: document.querySelector("#secret-random-start"),
    secretPickerLabel: document.querySelector("#secret-picker-label"),
    secretPickerGrid: document.querySelector("#secret-picker-grid"),
    board: document.querySelector("#character-board"),
    boardWorkspace: document.querySelector("#board-workspace"),
    heroPanel: document.querySelector("#hero-panel"),
    heroPanelScrim: document.querySelector("#hero-panel-scrim"),
    closeHeroPanel: document.querySelector("#close-hero-panel"),
    heroName: document.querySelector("#hero-name"),
    heroBackground: document.querySelector("#hero-background"),
    heroBody: document.querySelector("#hero-body"),
    heroTags: document.querySelector("#hero-tags"),
    heroPlaystyle: document.querySelector("#hero-playstyle"),
    abilityList: document.querySelector("#ability-list")
  };

  let characters = [];
  let eliminated = new Set();
  let secretId = null;
  let activeHero = null;
  let mobilePanelTrigger = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      eliminated = new Set(Array.isArray(saved.eliminated) ? saved.eliminated.map(String) : []);
      secretId = saved.secretId == null ? null : String(saved.secretId);
    } catch {
      eliminated = new Set();
      secretId = null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        eliminated: [...eliminated],
        secretId
      }));
    } catch {
      // The board still works when storage is unavailable.
    }
  }

  function showOnly(view) {
    [els.loadingView, els.errorView, els.gameView].forEach((item) => {
      item.classList.toggle("hidden", item !== view);
    });
  }

  async function loadCharacters(force = false) {
    const response = await fetch("./data/deadlock.json", { cache: force ? "reload" : "default" });
    if (!response.ok) throw new Error(`The hero file returned ${response.status}.`);
    const data = await response.json();
    if (!data || !Array.isArray(data.heroes) || data.heroes.length === 0) {
      throw new Error("The hero file did not contain a playable roster.");
    }
    return data.heroes.map((hero) => ({ ...hero, id: String(hero.id) }));
  }

  function preloadHeroArt(heroes) {
    const sources = heroes.flatMap((hero) => [
      hero.showcase ? `${hero.showcase}?v=${SHOWCASE_ASSET_VERSION}` : null,
      hero.background
    ]).filter(Boolean);
    return Promise.allSettled(sources.map((source) => new Promise((resolve) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = source;
    })));
  }

  async function startGame(force = false) {
    closeMobileHeroPanel(false);
    showOnly(els.loadingView);
    try {
      characters = await loadCharacters(force);
      await preloadHeroArt(characters);
    } catch (error) {
      showOnly(els.errorView);
      els.errorMessage.textContent = error instanceof Error ? error.message : "The hero data could not be read.";
      return;
    }

    loadState();
    const validIds = new Set(characters.map((character) => character.id));
    eliminated = new Set([...eliminated].filter((id) => validIds.has(id)));
    if (secretId && !validIds.has(secretId)) secretId = null;
    saveState();
    renderGame();
    showOnly(els.gameView);
    openSecretSetup();
  }

  function createCharacterCard(character) {
    const card = document.createElement("article");
    const isAvoided = eliminated.has(character.id);
    card.className = "character-card deadlock-card";
    card.dataset.characterId = character.id;
    card.title = character.name;
    card.setAttribute("role", "listitem");
    card.classList.toggle("is-avoided", isAvoided);

    const panel = document.createElement("div");
    panel.className = "card-panel";

    const face = document.createElement("button");
    face.className = "card-face";
    face.type = "button";
    face.setAttribute("aria-pressed", String(isAvoided));
    face.setAttribute("aria-label", `${isAvoided ? "Stop avoiding" : "Avoid"} ${character.name}`);

    const portraitFrame = document.createElement("span");
    portraitFrame.className = "portrait-frame";
    const image = document.createElement("img");
    image.src = character.body;
    image.alt = `${character.name} roster portrait`;
    image.loading = "lazy";
    image.decoding = "async";
    portraitFrame.append(image);

    const avoidMark = document.createElement("span");
    avoidMark.className = "avoid-mark";
    avoidMark.setAttribute("aria-hidden", "true");
    face.append(portraitFrame, avoidMark);
    card.addEventListener("pointerenter", () => selectHero(character));
    face.addEventListener("focus", () => selectHero(character));
    face.addEventListener("click", () => {
      selectHero(character);
      setEliminated(character.id, !eliminated.has(character.id));
    });

    const inspect = document.createElement("button");
    inspect.className = "inspect-hero";
    inspect.type = "button";
    inspect.textContent = "i";
    inspect.setAttribute("aria-label", `View ${character.name} details`);
    inspect.addEventListener("click", () => selectHero(character, inspect, true));

    panel.append(face, inspect);
    card.append(panel);
    return card;
  }

  function setEliminated(characterId, value) {
    const id = String(characterId);
    if (value) eliminated.add(id);
    else eliminated.delete(id);
    saveState();

    const card = els.board.querySelector(`[data-character-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.toggle("is-avoided", value);
      const face = card.querySelector(".card-face");
      if (face) {
        face.setAttribute("aria-pressed", String(value));
        const character = characters.find((item) => item.id === id);
        face.setAttribute("aria-label", `${value ? "Stop avoiding" : "Avoid"} ${character?.name || "hero"}`);
      }
    }
    updateProgress();
  }

  function renderGame() {
    els.board.replaceChildren();
    els.board.dataset.preset = "deadlock";
    els.boardWorkspace.dataset.preset = "deadlock";
    els.gameView.dataset.preset = "deadlock";
    const fragment = document.createDocumentFragment();
    characters.forEach((character) => fragment.append(createCharacterCard(character)));
    els.board.append(fragment);
    renderSecretPicker();
    els.heroPanel.classList.remove("hidden");
    els.heroPanel.setAttribute("aria-hidden", "false");
    updateProgress();
    renderSecret();
    const initialHero = characters.find((character) => character.id === activeHero?.id)
      || characters.find((character) => !eliminated.has(character.id))
      || characters[0];
    selectHero(initialHero);
  }

  function updateProgress() {
    const remaining = Math.max(0, characters.length - eliminated.size);
    els.remainingCount.textContent = String(remaining);
    els.remainingLabel.textContent = "remaining";
  }

  function renderSecret() {
    const character = characters.find((item) => item.id === secretId);
    els.secretDock.classList.toggle("hidden", !character);
    els.secretPeek.classList.remove("is-revealed");
    els.secretContent.replaceChildren();
    els.secretContent.setAttribute("aria-hidden", "true");
    if (!character) return;

    const image = document.createElement("img");
    image.src = character.headshot || character.body;
    image.alt = "";
    const text = document.createElement("span");
    text.textContent = character.name;
    els.secretContent.append(image, text);
  }

  function renderSecretPicker() {
    const fragment = document.createDocumentFragment();
    characters.forEach((character) => {
      const button = document.createElement("button");
      button.className = "secret-picker-card";
      button.type = "button";
      button.title = character.name;
      button.setAttribute("aria-label", `Choose ${character.name} as your secret hero`);
      button.classList.toggle("is-current", character.id === secretId);

      const image = document.createElement("img");
      image.src = character.body;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      button.append(image);
      ["pointerenter", "focus"].forEach((eventName) => {
        button.addEventListener(eventName, () => {
          els.secretPickerLabel.textContent = character.name;
        });
      });
      button.addEventListener("click", () => setSecret(character.id));
      fragment.append(button);
    });
    els.secretPickerGrid.replaceChildren(fragment);
  }

  function openSecretSetup() {
    renderSecretPicker();
    els.secretPickerLabel.textContent = secretId ? "Choose a different hero" : "Select a portrait to begin";
    els.secretSetup.classList.remove("hidden");
    document.body.classList.add("secret-setup-open");
    document.querySelector(".app-header")?.setAttribute("inert", "");
    document.querySelector(".app-main")?.setAttribute("inert", "");
    requestAnimationFrame(() => els.secretRandomStart.focus());
  }

  function closeSecretSetup() {
    els.secretSetup.classList.add("hidden");
    document.body.classList.remove("secret-setup-open");
    document.querySelector(".app-header")?.removeAttribute("inert");
    document.querySelector(".app-main")?.removeAttribute("inert");
    requestAnimationFrame(() => els.secretPeek.focus({ preventScroll: true }));
  }

  function revealSecret(value) {
    if (!secretId) return;
    els.secretPeek.classList.toggle("is-revealed", value);
    els.secretContent.setAttribute("aria-hidden", String(!value));
  }

  function pickRandomSecret() {
    if (characters.length === 0) return;
    const candidates = characters.filter((character) => !eliminated.has(character.id));
    const pool = candidates.length ? candidates : characters;
    secretId = pool[Math.floor(Math.random() * pool.length)].id;
    saveState();
    renderSecret();
    closeSecretSetup();
  }

  function setSecret(characterId) {
    secretId = String(characterId);
    saveState();
    renderSecret();
    closeSecretSetup();
  }

  function heroAccent(hero) {
    const palette = ["#d2a53c", "#4ca978", "#4c9db0", "#a786bd", "#cf6848", "#668fc5"];
    const hash = [...hero.name].reduce((total, character) => total + character.charCodeAt(0), 0);
    return palette[hash % palette.length];
  }

  function selectHero(hero, trigger = null, openOnMobile = false) {
    if (!hero) return;
    activeHero = hero;
    els.board.querySelectorAll(".deadlock-card.is-selected").forEach((card) => {
      card.classList.remove("is-selected");
      card.style.removeProperty("--hero-accent");
    });
    const selectedCard = els.board.querySelector(`[data-character-id="${CSS.escape(hero.id)}"]`);
    selectedCard?.classList.add("is-selected");
    selectedCard?.style.setProperty("--hero-accent", heroAccent(hero));
    els.heroPanel.style.setProperty("--hero-accent", heroAccent(hero));
    els.heroName.textContent = hero.name;
    els.heroBackground.src = hero.background;
    els.heroBackground.alt = "";
    els.heroBody.src = hero.showcase
      ? `${hero.showcase}?v=${SHOWCASE_ASSET_VERSION}`
      : hero.body;
    els.heroBody.alt = `${hero.name} character artwork`;
    els.heroTags.replaceChildren();
    const tags = Array.isArray(hero.tags) && hero.tags.length ? hero.tags : [hero.role];
    tags.filter(Boolean).forEach((tag) => {
      const item = document.createElement("span");
      item.textContent = tag;
      els.heroTags.append(item);
    });
    els.heroPlaystyle.textContent = hero.playstyle;
    els.abilityList.replaceChildren();
    hero.abilities.forEach((ability, index) => {
      const item = document.createElement("article");
      item.className = "ability";
      const image = document.createElement("span");
      image.className = "ability-icon";
      image.style.setProperty("--ability-icon", `url("${ability.icon}")`);
      image.setAttribute("aria-hidden", "true");
      const number = document.createElement("span");
      number.className = "ability-number";
      number.textContent = String(index + 1);
      const copy = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = ability.name;
      const description = document.createElement("p");
      description.textContent = ability.description;
      copy.append(title, description);
      item.append(image, number, copy);
      els.abilityList.append(item);
    });
    if (openOnMobile && window.matchMedia(MOBILE_PANEL_QUERY).matches) openMobileHeroPanel(trigger);
  }

  function isMobileHeroPanelOpen() {
    return els.heroPanel.classList.contains("is-mobile-open");
  }

  function openMobileHeroPanel(trigger) {
    mobilePanelTrigger = trigger || null;
    els.heroPanel.classList.add("is-mobile-open");
    els.heroPanelScrim.classList.remove("hidden");
    els.heroPanel.setAttribute("role", "dialog");
    els.heroPanel.setAttribute("aria-modal", "true");
    els.heroPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("hero-panel-open");
    requestAnimationFrame(() => els.closeHeroPanel.focus());
  }

  function closeMobileHeroPanel(restoreFocus = true) {
    if (!isMobileHeroPanelOpen()) return;
    els.heroPanel.classList.remove("is-mobile-open");
    els.heroPanelScrim.classList.add("hidden");
    els.heroPanel.removeAttribute("role");
    els.heroPanel.removeAttribute("aria-modal");
    els.heroPanel.setAttribute("aria-hidden", "false");
    document.body.classList.remove("hero-panel-open");
    if (restoreFocus) mobilePanelTrigger?.focus({ preventScroll: true });
    mobilePanelTrigger = null;
  }

  els.retryButton.addEventListener("click", () => startGame(true));
  els.secretRandomStart.addEventListener("click", pickRandomSecret);
  els.clearSecret.addEventListener("click", openSecretSetup);
  els.resetBoard.addEventListener("click", () => {
    if ((eliminated.size > 0 || secretId) && !window.confirm("Restore every hero and clear your secret?")) return;
    eliminated.clear();
    secretId = null;
    saveState();
    renderGame();
    openSecretSetup();
  });

  els.secretPeek.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    revealSecret(true);
    try { els.secretPeek.setPointerCapture(event.pointerId); } catch { /* Not available for every pointer. */ }
  });
  ["pointerup", "pointercancel", "pointerleave", "blur"].forEach((eventName) => {
    els.secretPeek.addEventListener(eventName, () => revealSecret(false));
  });
  els.secretPeek.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    revealSecret(true);
  });
  els.secretPeek.addEventListener("keyup", (event) => {
    if (event.key === "Enter" || event.key === " ") revealSecret(false);
  });

  els.closeHeroPanel.addEventListener("click", () => closeMobileHeroPanel());
  els.heroPanelScrim.addEventListener("click", () => closeMobileHeroPanel());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isMobileHeroPanelOpen()) closeMobileHeroPanel();
  });

  startGame();
})();
