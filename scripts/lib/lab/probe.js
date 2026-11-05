// In-page probes for the standards checks. Playwright adds this file to every
// page as an init script (checks.mjs, tests/e2e/support/fixtures.mjs), so the
// checks can call `page.evaluate(() => sdkProbe.reflow())` and get plain data back.
//
// A problem the probes find is an item: { selector, detail, rect }. `selector`
// finds the element again (for "show on page"), `detail` is a sentence for a
// person, and `rect` is where it sits on the page in CSS px, or null.
//
// Everything skips the playground's design panels ([data-sdk-design-panel] on
// kit pages, [data-sdk-live-panel] on lab copies): they are dev tooling that
// the server injects, not part of the page.

(() => {
  const PANEL = '[data-sdk-design-panel], [data-sdk-live-panel]';
  const INTERACTIVE = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[tabindex]',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    ...['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider', 'spinbutton', 'combobox'].map(
      (role) => `[role="${role}"]`,
    ),
  ].join(', ');

  /** True when `el` is the design panel or inside it, including its shadow root. */
  function inPanel(el) {
    for (let node = el; node; ) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(PANEL)) return true;
      node = node.parentNode ?? node.host ?? null;
    }
    return false;
  }

  function visible(el) {
    if (!el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  /** A short, stable description of an element for failure messages. */
  function describe(el) {
    let text = `${el.localName}`;
    if (el.id) text += `#${el.id}`;
    const classes = [...el.classList].slice(0, 3);
    if (classes.length) text += `.${classes.join('.')}`;
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return label ? `${text} "${label}"` : text;
  }

  /** A CSS selector that finds `el` again: its id when that is unique, else a path of nth-of-type steps. */
  function selectorFor(el) {
    if (el === document.documentElement) return 'html';
    const steps = [];
    for (let node = el; node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement; node = node.parentElement) {
      if (node.id) {
        const id = `#${CSS.escape(node.id)}`;
        const root = node.getRootNode();
        if (root.querySelectorAll(id).length === 1) {
          steps.unshift(id);
          return steps.join(' > ');
        }
      }
      let step = CSS.escape(node.localName);
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.localName === node.localName);
        if (same.length > 1) step += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      steps.unshift(step);
    }
    return steps.join(' > ');
  }

  /** Where `el` sits on the page (not the viewport), in whole CSS px. */
  function rectOf(el) {
    const rect = el.getBoundingClientRect();
    return { x: Math.round(rect.left + scrollX), y: Math.round(rect.top + scrollY), width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  /** One problem: `detail` follows the element's description, as in `button "Close" is 30×30px`. */
  function item(el, detail = '') {
    return { selector: selectorFor(el), detail: detail ? `${describe(el)} ${detail}` : describe(el), rect: rectOf(el) };
  }

  // ------------------------------------------------------------- color math

  /** Parses a computed color: rgb()/rgba() and color(srgb …). Returns null for anything else. */
  function parseColor(value) {
    const text = value.trim();
    if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    let match = text.match(/^rgba?\((.+)\)$/);
    if (match) {
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat);
      const [r, g, b, a = 1] = parts;
      return { r: r / 255, g: g / 255, b: b / 255, a };
    }
    match = text.match(/^color\(srgb\s+(.+)\)$/);
    if (match) {
      const parts = match[1].split(/[\s/]+/).filter(Boolean).map(Number.parseFloat);
      const [r, g, b, a = 1] = parts;
      return { r, g, b, a };
    }
    return null;
  }

  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (c) => (top[c] * top.a + bottom[c] * bottom.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };

  function luminance({ r, g, b }) {
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  /**
   * The solid color behind `el`, composited up the ancestor chain, or null when
   * a background image or an unparsable color makes it unmeasurable.
   */
  function backgroundBehind(el) {
    const layers = [];
    for (let node = el; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null;
      const color = parseColor(style.backgroundColor);
      if (!color) return null;
      layers.push(color);
      if (color.a >= 1) break;
    }
    const canvas = matchMedia('(prefers-color-scheme: dark)').matches ? { r: 0, g: 0, b: 0, a: 1 } : { r: 1, g: 1, b: 1, a: 1 };
    return layers.reduceRight((below, layer) => over(layer, below), canvas);
  }

  // ------------------------------------------------------------------ probes

  /** LAY-06: horizontal overflow of the page, with the elements that stick out. */
  function reflow() {
    const root = document.documentElement;
    const width = root.clientWidth;
    const offenders = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (inPanel(el) || !visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.right <= width + 1 && rect.left >= -1) continue;
      // Content inside a scroll or clip container is that container's business.
      let contained = false;
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') {
          contained = true;
          break;
        }
      }
      if (!contained) offenders.push(item(el, `spans ${Math.round(rect.left)}..${Math.round(rect.right)}px`));
    }
    return { scrollWidth: root.scrollWidth, clientWidth: width, innerWidth, offenders };
  }

  /** LAY-07, TYP-08: elements that clip their text (overflow hidden or clip, content larger than the box). */
  function clippedText() {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (inPanel(el) || !visible(el) || el.closest('.sdk-visually-hidden')) continue;
      const style = getComputedStyle(el);
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      if (!clipsX && !clipsY) continue;
      if (!el.textContent.trim()) continue;
      const overX = clipsX && el.scrollWidth > el.clientWidth + 1;
      const overY = clipsY && el.scrollHeight > el.clientHeight + 1;
      if (overX || overY) {
        out.push(item(el, `clips ${overX ? `${el.scrollWidth}>${el.clientWidth}px wide` : ''}${overX && overY ? ', ' : ''}${overY ? `${el.scrollHeight}>${el.clientHeight}px tall` : ''}`));
      }
    }
    return out;
  }

  /**
   * ACC-01, BTN-01: visible controls whose hit region is under `min` px on either axis.
   * A control's hit region includes its <label>s. Text links (display: inline) are
   * left to axe's target-size rule, which applies the 24px floor and WCAG's
   * inline-in-a-sentence exception (ACC-01's dense floor).
   */
  function undersizedTargets(min) {
    const out = [];
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (inPanel(el) || el.matches('[tabindex="-1"]') || el.closest('[inert]')) continue;
      const style = getComputedStyle(el);
      if (el.matches('a[href]') && style.display === 'inline') continue;
      const regions = [el, ...(el.labels ?? [])].filter(visible).map((node) => node.getBoundingClientRect());
      if (!regions.length) continue;
      const width = Math.max(...regions.map((rect) => rect.width));
      const height = Math.max(...regions.map((rect) => rect.height));
      if (width < min - 0.5 || height < min - 0.5) out.push(item(el, `is ${Math.round(width)}×${Math.round(height)}px`));
    }
    return out;
  }

  /**
   * TYP-01, TYP-04, TYP-06: rendered text below 11px or lighter than regular (400),
   * the non-monospace font-family stacks text renders in, and monospace text outside
   * code, kbd, samp, pre, and .sdk-font-mono (SKUs and numbers).
   */
  function renderedText() {
    // Keyed by element and detail, so text nodes that share an element and its style are one item.
    const tooSmall = new Map();
    const tooLight = new Map();
    const families = new Map();
    const strayMono = new Map();
    const add = (list, el, detail) => {
      const found = item(el, detail);
      const key = `${found.selector}|${found.detail}`;
      if (!list.has(key)) list.set(key, found);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent.trim() || inPanel(el) || !visible(el)) continue;
      if (el.closest('.sdk-visually-hidden, script, style, noscript')) continue;
      const style = getComputedStyle(el);
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseFloat(style.fontWeight);
      if (size < 11) add(tooSmall, el, `at ${size}px`);
      if (weight < 400) add(tooLight, el, `at weight ${weight}`);
      const family = style.fontFamily;
      if (/\bmonospace\b/.test(family)) {
        if (!el.closest('code, kbd, samp, pre, .sdk-font-mono')) add(strayMono, el);
      } else if (!families.has(family)) {
        const first = item(el);
        families.set(family, { ...first, detail: `${family} (first on ${first.detail})` });
      }
    }
    return {
      tooSmall: [...tooSmall.values()],
      tooLight: [...tooLight.values()],
      families: [...families.values()],
      strayMono: [...strayMono.values()],
    };
  }

  /** FRM-02: email, tel, and url fields carry an autocomplete token. */
  function fieldsWithoutAutocomplete() {
    return [...document.querySelectorAll('input[type="email"], input[type="tel"], input[type="url"]')]
      .filter((el) => !inPanel(el) && !el.getAttribute('autocomplete'))
      .map((el) => item(el));
  }

  /**
   * ACC-10, LAY-01: the elements Tab should reach, in DOM order, each tagged with
   * data-sdk-tab so the walk can match them (`order` holds their descriptions,
   * `selectors` their selectors). Also returns, as items, what breaks DOM order.
   */
  function tabbables() {
    const seenRadioGroups = new Set();
    const order = [];
    const selectors = [];
    const positiveTabindex = [];
    const autofocus = [];
    const reordered = [];
    const radios = (name, form) =>
      [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)].filter((el) => el.form === form);
    for (const el of document.body.querySelectorAll(INTERACTIVE)) {
      if (inPanel(el)) continue;
      if (el.tabIndex > 0) positiveTabindex.push(item(el, `has tabindex ${el.tabIndex}`));
      if (el.hasAttribute('autofocus')) autofocus.push(item(el));
      if (el.tabIndex < 0 || el.disabled || el.closest('[inert]') || !visible(el)) continue;
      if (el.matches('input[type="radio"]') && el.name) {
        const key = `${el.form?.id ?? ''}|${el.name}`;
        if (seenRadioGroups.has(key)) continue;
        seenRadioGroups.add(key);
        const group = radios(el.name, el.form);
        const target = group.find((radio) => radio.checked) ?? group[0];
        if (target !== el) continue;
      }
      // LAY-01: CSS must not move a control away from its DOM position.
      const style = getComputedStyle(el);
      const parent = el.parentElement && getComputedStyle(el.parentElement);
      if (style.order !== '0') reordered.push(item(el, `has order: ${style.order}`));
      if (parent && /reverse/.test(`${parent.flexDirection} ${parent.flexWrap}`)) {
        reordered.push(item(el, `sits in a ${parent.flexDirection} ${parent.flexWrap} container`));
      }
      el.dataset.sdkTab = String(order.length);
      order.push(describe(el));
      selectors.push(selectorFor(el));
    }
    return { order, selectors, positiveTabindex, autofocus, reordered };
  }

  function deepActive() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  /** True when some of `el` is on screen and not covered by another element (ACC-11, LAY-11). */
  function unobscured(el) {
    const rect = el.getBoundingClientRect();
    const points = [
      [0.5, 0.5],
      [0.1, 0.1],
      [0.9, 0.1],
      [0.1, 0.9],
      [0.9, 0.9],
    ].map(([fx, fy]) => [rect.left + rect.width * fx, rect.top + rect.height * fy]);
    return points.some(([x, y]) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementsFromPoint(x, y).find((node) => !inPanel(node));
      return hit && (hit === el || el.contains(hit) || [...(el.labels ?? [])].some((label) => label.contains(hit)));
    });
  }

  /** The focused element and how its focus indicator renders (ACC-09). */
  function focusState() {
    const el = deepActive();
    if (!el || el === document.body) return { key: null, inPanel: false };
    if (inPanel(el)) return { key: null, inPanel: true, desc: describe(el) };
    const style = getComputedStyle(el);
    const outline = parseColor(style.outlineColor);
    // The outline sits outside the element (outline-offset), over the parent's background.
    const behind = backgroundBehind(el.parentElement ?? el);
    return {
      key: el.dataset.sdkTab ?? null,
      inPanel: false,
      desc: describe(el),
      selector: selectorFor(el),
      rect: rectOf(el),
      focusVisible: el.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineContrast: outline && behind && outline.a >= 1 ? Math.round(contrast(outline, behind) * 100) / 100 : null,
      unobscured: unobscured(el),
    };
  }

  /** DRK-01: the page's background and text luminance and its declared color-scheme. */
  function appearance() {
    const body = getComputedStyle(document.body);
    const bg = parseColor(body.backgroundColor);
    const fg = parseColor(body.color);
    return {
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      background: bg && luminance(bg),
      text: fg && luminance(fg),
      label: getComputedStyle(document.documentElement).getPropertyValue('--sdk-color-label').trim(),
    };
  }

  const MOVEMENT = /^(transform|translate|scale|rotate|offset(Path|Distance|Rotate|Anchor|Position))$/;

  /** MOT-02, MOT-07: every animation on the page, with whether its keyframes move things. */
  function animations() {
    return document.getAnimations().map((animation) => {
      const timing = animation.effect?.getComputedTiming() ?? {};
      const keyframes = animation.effect?.getKeyframes?.() ?? [];
      const target = animation.effect?.target;
      return {
        name: animation.animationName ?? animation.transitionProperty ?? animation.constructor.name,
        target: target ? describe(target) : null,
        selector: target ? selectorFor(target) : null,
        rect: target ? rectOf(target) : null,
        inPanel: target ? inPanel(target) : false,
        playState: animation.playState,
        moves: keyframes.some((frame) => Object.keys(frame).some((key) => MOVEMENT.test(key))),
        activeDuration: timing.activeDuration,
        iterations: timing.iterations,
      };
    });
  }

  globalThis.sdkProbe = {
    reflow,
    clippedText,
    undersizedTargets,
    renderedText,
    fieldsWithoutAutocomplete,
    tabbables,
    focusState,
    appearance,
    animations,
  };
})();
