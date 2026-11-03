// Dev client, injected into every HTML page by playground/server.mjs.
// - Live reload: saved CSS is swapped in place; any other saved file reloads the page.
// - Design panel: see panel.js.

import { mountDesignPanel } from './panel.js';

function swapStylesheets(root) {
  for (const link of root.querySelectorAll('link[rel="stylesheet"]')) {
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) continue;
    url.searchParams.set('t', Date.now().toString(36));
    const next = link.cloneNode();
    next.href = url.href;
    // Swap after the new sheet loads so the page never flashes unstyled.
    next.addEventListener('load', () => link.remove(), { once: true });
    next.addEventListener('error', () => next.remove(), { once: true });
    link.after(next);
  }
}

function connect() {
  const events = new EventSource('/__dev/events');
  let lostConnection = false;
  events.addEventListener('error', () => {
    lostConnection = true;
  });
  events.addEventListener('open', () => {
    // The server restarted: its code or the files may have changed while it was down.
    if (lostConnection) location.reload();
  });
  events.addEventListener('message', (event) => {
    let path = '';
    try {
      ({ path } = JSON.parse(event.data));
    } catch {
      return;
    }
    if (path.endsWith('.css')) {
      swapStylesheets(document);
      const panel = document.querySelector('[data-sdk-design-panel]');
      if (panel?.shadowRoot) swapStylesheets(panel.shadowRoot);
    } else {
      location.reload();
    }
  });
}

connect();
mountDesignPanel();
