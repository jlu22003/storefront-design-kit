// Dev client, injected into every HTML page by playground/server.mjs.
// - Live reload: saved CSS is swapped in place; any other saved file reloads the page.
// - Design panel: see panel.js. A page opts out with <html data-sdk-panel="off">.
// - Framed pages: inside an <iframe data-sdk-embed="…"> on a playground page
//   (format frames, variant boards) the client opens no connection of its own;
//   the host page swaps the frame's CSS and reloads it. "frame" and "print"
//   frames follow the host page's Design panel; "print" frames also show the
//   page's print styles. "variant" frames are styled by the board.

import { printMediaText } from './formats.js';
import { followDesign, mountDesignPanel } from './panel.js';

function embedMode() {
  try {
    return window.frameElement?.getAttribute('data-sdk-embed') ?? null;
  } catch {
    return null;
  }
}

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

// Same-origin documents framed by this page (format frames and variant boards).
function framedDocuments() {
  return [...document.querySelectorAll('iframe[data-sdk-embed]')]
    .map((frame) => {
      try {
        return frame.contentDocument;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function swapAll() {
  for (const doc of [document, ...framedDocuments()]) {
    swapStylesheets(doc);
    for (const panel of doc.querySelectorAll('[data-sdk-design-panel]')) {
      if (panel.shadowRoot) swapStylesheets(panel.shadowRoot);
    }
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
    if (path.endsWith('.css')) swapAll();
    else location.reload();
  });
}

/** Shows the document's print styles on screen by rewriting its media queries. */
function emulatePrint(doc) {
  const rewrite = (list) => {
    const next = printMediaText(list.mediaText);
    if (next !== list.mediaText) list.mediaText = next;
  };
  for (const node of doc.querySelectorAll('link[rel~="stylesheet"][media], style[media]')) {
    node.media = printMediaText(node.media);
  }
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.media) rewrite(rule.media);
      try {
        if (rule.styleSheet) walk(rule.styleSheet.cssRules);
      } catch {
        // A cross-origin @import cannot be read; it keeps its media.
      }
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets (web fonts) cannot be read; they keep their media.
    }
  }
}

const embed = embedMode();
if (embed) {
  // Browsers allow only a handful of open connections per host, so frames
  // leave live reload to the host page.
  if (embed === 'frame' || embed === 'print') followDesign();
  if (embed === 'print') {
    emulatePrint(document);
    // Stylesheets that finish loading later (or are swapped in) need the same rewrite.
    document.addEventListener(
      'load',
      (event) => {
        if (event.target.localName === 'link') emulatePrint(document);
      },
      true,
    );
  }
} else {
  connect();
  if (document.documentElement.dataset.sdkPanel !== 'off') mountDesignPanel();
}
