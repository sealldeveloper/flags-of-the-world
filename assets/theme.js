// Shared by the published games only. Run in <head> before styles for the first paint.
(() => {
  'use strict';
  // v1 mixed automatically migrated defaults with deliberate choices. Start
  // everyone in System once; only new explicit choices are remembered in v2.
  const key = 'puzzle-theme-v2';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const valid = value => value === 'light' || value === 'dark' ? value : null;
  let preference = null;
  try {
    preference = valid(localStorage.getItem(key));
  } catch (_) { /* System default. */ }
  const current = () => preference || (system.matches ? 'dark' : 'light');
  function render() {
    const theme = current(), root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themeMode = preference || 'system';
    const page = location.pathname.split('/')[1];
    root.dataset.sitePage = !page || page === 'index.html' ? 'home' : page;
    root.style.colorScheme = theme;
    document.querySelectorAll('.site-theme-select').forEach(select => {
      select.value = preference || 'system';
      select.title = preference ? `Using ${theme} theme` : `Following system theme (${theme})`;
    });
    dispatchEvent(new CustomEvent('puzzle-theme-change', {detail:{theme, preference:preference || 'system'}}));
  }
  window.PuzzleTheme = Object.freeze({
    get current() { return current(); },
    get preference() { return preference || 'system'; },
    setPreference(value) {
      if (!['system', 'light', 'dark'].includes(value)) return;
      preference = valid(value);
      try { localStorage.setItem(key, preference || 'system'); } catch (_) { /* Works for this tab without storage. */ }
      render();
    },
  });
  render();
  if (system.addEventListener) system.addEventListener('change', render);
  else system.addListener(render);
  addEventListener('storage', event => { if (event.key === key || event.key === null) { preference = valid(event.newValue); render(); } });
  function mount() {
    document.querySelectorAll('[data-theme-picker], #btn-theme-toggle').forEach(slot => {
      const label = document.createElement('label'); label.className = 'site-theme-picker';
      const text = document.createElement('span'); text.textContent = 'Theme';
      const select = document.createElement('select'); select.className = 'site-theme-select'; select.setAttribute('aria-label', 'Colour theme');
      for (const [value, name] of [['system','System'],['light','Light'],['dark','Dark']]) { const option = document.createElement('option'); option.value = value; option.textContent = name; select.append(option); }
      select.addEventListener('change', () => PuzzleTheme.setPreference(select.value));
      select.addEventListener('keydown', event => event.stopPropagation());
      label.append(text, select); slot.replaceWith(label);
    });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount();
})();
