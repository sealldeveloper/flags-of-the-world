(() => {
  "use strict";

  const ORIGINAL_URL = "https://swellgarfo.com/scattergories/";
  const status = document.querySelector("#remote-status");
  const statusCopy = document.querySelector("#status-copy");
  const openOriginal = document.querySelector("#open-original");

  function setStatus(state, copy) {
    status.dataset.state = state;
    statusCopy.textContent = copy;
  }

  function useFallback(copy) {
    setStatus("fallback", copy);
  }

  async function checkOriginal() {
    if (!navigator.onLine) {
      useFallback("You appear to be offline. Use the self-hosted backup below.");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(ORIGINAL_URL, {
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);
      setStatus("available", "The original site is available.");
    } catch {
      clearTimeout(timeout);
      useFallback("The original could not be reached. Use the self-hosted backup below.");
    }
  }

  openOriginal.addEventListener("click", () => {
    setStatus("available", "Opening Swellgarfo’s original site…");
  });

  checkOriginal();
})();
