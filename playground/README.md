# Playground

A live prototyping page for the kit. No framework: plain HTML, the kit's CSS,
and a small Node server that uses only built-in modules.

## Run it

```sh
npm install   # once
npm run dev   # serves http://127.0.0.1:4400/playground/ and opens it
```

Options: `npm run dev -- --port 5000` picks a port, and `--no-open` skips
opening the browser. The server listens on 127.0.0.1 only and answers only to
localhost host names. It serves `theme/assets/`, `playground/`, and `sketches/`,
and nothing else from the repo.

Saving an HTML or JS file reloads the page. Saving a CSS file swaps the
stylesheets in place, so the page keeps its scroll position and panel settings.

## Pages

- `index.html` links everything.
- `primitives.html` demonstrates each layout primitive and the text styles.
- `starters/landing.html`, `starters/product.html`, and
  `starters/collection.html` are full pages built only from the primitives and
  tokens. The `pg-` classes in `assets/sketch.css` are placeholder visuals
  that stand in for components until the kit ships them.

## Sketches (private)

```sh
npm run sketch -- my-idea                     # from the landing starter
npm run sketch -- pdp-test --from product     # or product, collection
```

This copies a starter to `sketches/<name>/index.html` and prints its URL.
Open `/sketches/` in the playground to see them all. Put extra CSS or images
beside the page in the same folder.

`sketches/` is gitignored. Nothing in it is committed or pushed, so it is the
place for half-finished ideas and client work. Back it up yourself if it
matters.

## Design panel

The **Design** button (bottom corner of every served page) opens a panel:

- **Appearance** (system, light, dark) preview. Color picks are kept per
  appearance: light picks apply in light, dark picks in dark.
- **Spacing**, **Type scale**, and **Corner radius** sliders scale every
  `--sdk-space-*`, `--sdk-font-size-*`, and `--sdk-radius-*` token.
- **Color pickers** for the main color roles, with live WCAG contrast ratios
  for text, links, accent, and control borders.
- **Copy CSS** copies only the tokens you changed: a `:root { … }` block, plus
  one block per appearance for the colors picked in it.
  **Reset** returns to the token values.

Changes are kept in this browser's localStorage, so they survive reloads.
To keep values, paste the copied CSS into a sketch stylesheet, or put the
numbers into `tokens/*.tokens.json` and run `npm run tokens`.

The panel is keyboard accessible: Tab to the button, and press Escape inside
the panel to close it and return focus to the button.
