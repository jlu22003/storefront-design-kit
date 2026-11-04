# Playwright standards tests

Browser tests for the base CSS, the layout primitives, and the playground
pages. Each test is tagged with the catalog IDs it checks
([catalog/STANDARDS.md](../../catalog/STANDARDS.md)), and a failure names the
standard with its HIG and WCAG links.

```sh
npm run test:e2e:docker    # everything, in the pinned image CI uses (needs Docker)
npm run test:e2e           # everything except screenshots, with your own browsers
npx playwright install     # once, before the first `npm run test:e2e`
```

Arguments after `--` go to `playwright test`, for example
`npm run test:e2e:docker -- --project desktop-chrome-light layout`.
Playwright starts the playground server (`playground/server.mjs`) on port 4410
(`SDK_E2E_PORT` changes it) and reuses one that is already running locally.

## Projects (PR smoke)

| Project | Device | Runs |
|---|---|---|
| `iphone-17-pro-light`, `iphone-17-pro-dark` | iPhone 17 Pro, WebKit, 402×681 | axe, layout, focus, appearance, screenshots |
| `ipad-mini-light`, `ipad-mini-dark` | iPad Mini, WebKit, 768×1024 | the same |
| `desktop-chrome-light`, `desktop-chrome-dark` | Desktop Chrome, Chromium, 1280×720 | the same |
| `iphone-17-pro-text-200` | iPhone 17 Pro, 200% text | axe, 200% text and page zoom, 200% screenshots |
| `iphone-17-pro-reduced-motion` | iPhone 17 Pro, `reducedMotion: 'reduce'` | axe, reduced motion |
| `lab` | Desktop Chrome, Chromium | `lab-copy`: copies a fixture site served on localhost (`npm run lab:copy`) and opens the copy on the playground server |

The nightly full matrix (every viewport, increased contrast, forced colors,
RTL) and Lighthouse come later.

## Checks

| Spec | Check | Catalog IDs |
|---|---|---|
| `a11y` | axe-core: WCAG 2.0 to 2.2 A and AA plus best practices. Each axe rule maps to its IDs in `support/fixtures.mjs`. Email, phone, and URL fields carry `autocomplete`. | ACC-01 (24px floor), ACC-03, ACC-04, ACC-05, ACC-16, COL-01, DRK-03, FRM-01, FRM-02, MOT-07, NAV-13 |
| `layout` | No horizontal scroll at the project viewport, or at 320×568 | LAY-05, LAY-06 |
| `layout` | Controls have a hit region of at least 44×44px, labels included. Text links (`display: inline`) get axe's 24px floor and its inline exception instead. | ACC-01, BTN-01 |
| `layout` | WCAG 1.4.12 text spacing clips no text and adds no horizontal scroll | TYP-08 |
| `layout` | Rendered text is at least 11px and weight 400 or more, in at most 2 font families, with monospace only in code, SKUs, and numbers | TYP-01, TYP-04, TYP-06 |
| `focus` | Tab reaches every control in DOM order; no `tabindex` above 0, no `autofocus`, no CSS `order` or `*-reverse` around controls | ACC-07, ACC-10, LAY-01 |
| `focus` | Each focused control matches `:focus-visible` with a 2px outline at 3:1 against what is behind it, and is not hidden by sticky chrome | ACC-09, ACC-11, LAY-11 |
| `appearance` | Follows the OS appearance and the `data-theme` override | DRK-01 |
| `appearance` | `prefers-contrast: more` swaps in the increased-contrast tokens; axe contrast still passes | ACC-18, DRK-03, COL-01 |
| `appearance` | No animation loops forever or runs over 5 seconds | MOT-07 |
| `reduced-motion` | A moving probe animation stops, and smooth scrolling is off; the same probe moves without the preference | MOT-02, LST-06 |
| `text-zoom` | At 200% text (root font size 32px) and 200% page zoom (320px viewport), no text clips and nothing scrolls sideways | LAY-07, TYP-03 |
| `visual`, `text-zoom` | Screenshot baselines (tagged `@visual`) | LAY-02, LAY-04, DRK-02, DRK-04, LAY-07, TYP-10 |

The checks skip the playground's design panel: the server injects it into
every page as dev tooling, and it is not part of a kit page.

One exception is recorded in `support/pages.mjs`: at 200% text the primitives
demo may scroll sideways, because its fixed-size and non-wrapping demos are
wider than a 402px phone has room for (12.5rem). Its text must still not clip.

## Visual baselines

Baselines live in `__screenshots__/<spec>/<page>-<project>.png`: the primitives
demo and the three starters in each viewport project, light and dark, plus each
at 200% text. They are full-page screenshots at CSS pixel scale, with
animations and the caret off and the design panel hidden.

**How they are pinned.** Screenshots differ between operating systems, font
sets, and browser builds, so baselines are rendered in one place only: the
official Playwright image whose tag matches `@playwright/test` in
`package.json` (`mcr.microsoft.com/playwright:v1.64.1-noble`). CI's e2e job
runs in that image, and `npm run test:e2e:docker` runs the same image locally.
Both set `SDK_PINNED_RENDERER=1`; without it the screenshot tests skip with a
reason, so `npm run test:e2e` on a Mac or Windows machine stays green.
`scripts/test/pinning.test.mjs` fails unless `package.json` pins
`@playwright/test` exactly; when you upgrade it, update the workflow image tag
to match, then refresh the baselines.

**Fonts.** Tests block every request that leaves the playground server, so
pages never download Inter, Source Serif 4, or IBM Plex Mono from Google Fonts
and render the fallback stacks with the fonts installed in the image (Liberation
Sans, Serif, and Mono). That keeps runs hermetic and baselines stable; check
the real fonts by eye in the playground.

**Updating.** After an intended visual change:

```sh
npm run test:e2e:docker -- --update-snapshots --grep @visual
```

Review the changed PNGs in the diff before committing them. A failing
comparison in CI uploads the expected, actual, and diff images in the
`playwright-report` artifact.

## Coverage gate

`npm run catalog:check` reports which catalog standards have tests. It reads
what the test runners report, not test source, so comments, strings, hook
titles, and skipped tests never count:

- **Playwright:** the JSON report of a run (`reports/playwright.json`, written
  on every run) or, without one, `playwright test --list --reporter=json`.
  IDs are tags. A test counts when at least one project ran it.
- **node:test:** the gate runs `tests/**/*.test.mjs` with
  `scripts/lib/node-test-reporter.mjs`. The ID is in the test's own name.
  Skipped and todo tests, including an in-body `t.skip()`, do not count.
- **Lint:** `catalog/lint-map.json` maps Stylelint rules to IDs.

A listing cannot see an in-body `test.skip()` or `test.fixme()`, so
enforcement needs a run report:

```sh
npm run test:e2e:docker
npm run catalog:check -- --enforce --playwright-report reports/playwright.json
```

**Policy.** `catalog/enforced.json` lists the standards the gate enforces:
every automated or visual standard that has tests so far. With `--enforce` the
gate fails when an enforced automated standard has no test that ran, an
enforced visual standard has no `@visual` screenshot test that ran, or any test
names an ID that is not in the catalog. Automated and visual standards that are
not listed yet are reported but do not fail; the change that ships their tests
adds them to the list. axe also runs its table (LST-05) and dialog (MOD-05)
rules, but no page has a table or dialog yet, so those two stay untagged and
unenforced until the table and dialog components ship. FRM-01 is enforced by
axe's `label` rule now; its other half, "a placeholder is never the only
label", is deferred to the form components step. CI runs the enforcing gate
after the Playwright run and keeps `reports/catalog-coverage.json` (tests per
ID) in the `playwright-report` artifact.
