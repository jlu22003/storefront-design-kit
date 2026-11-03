// The pages under test: the playground index, the primitives demo, and the
// three starters. `visual` marks the pages with committed screenshot baselines.
//
// `wideAt200` lists why a page may scroll sideways at 200% text on a phone.
// The primitives demo shows fixed sizes (6rem, min 12rem) and non-wrapping
// rows on purpose; at 200% text a 402px phone has 12.5rem of room, so those
// demos are wider than the screen. Its text must still never clip.

export const PAGES = [
  { name: 'playground', path: '/playground/', visual: false },
  {
    name: 'primitives',
    path: '/playground/primitives.html',
    visual: true,
    wideAt200: 'fixed-size and non-wrapping demos are wider than 12.5rem by design',
  },
  { name: 'landing', path: '/playground/starters/landing.html', visual: true },
  { name: 'product', path: '/playground/starters/product.html', visual: true },
  { name: 'collection', path: '/playground/starters/collection.html', visual: true },
];

/** The floor viewport for reflow (LAY-06): 320 CSS px, as on iPhone SE or a 1280px window at 400%. */
export const REFLOW_VIEWPORT = { width: 320, height: 568 };

/**
 * Visual baselines render only in the pinned Playwright image (CI, or
 * `npm run test:e2e:docker`), which sets SDK_PINNED_RENDERER=1.
 * Anywhere else fonts and antialiasing differ, so screenshot tests skip.
 */
export const PINNED_RENDERER = process.env.SDK_PINNED_RENDERER === '1';
export const UNPINNED_REASON = 'screenshots compare only in the pinned Playwright image: run `npm run test:e2e:docker`';
