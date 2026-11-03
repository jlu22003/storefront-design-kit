// Stylelint config. Each kit rule names the catalog standard it enforces;
// catalog/lint-map.json records the same mapping for the coverage gate.

const TOKEN = (group) => new RegExp(`^var\\(--sdk-${group}-[a-z0-9-]+\\)$`);

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: [
    // Generated from tokens/: it is where literal values are allowed to live.
    'theme/assets/sdk-tokens.css',
    'dist/**',
    'node_modules/**',
    // Private, gitignored scratch work.
    'sketches/**',
  ],
  rules: {
    // LAY-13: physical left/right properties do not mirror under dir="rtl".
    'property-disallowed-list': [
      [/^(left|right)$/, /-(left|right)(-|$)/],
      { message: (property) => `LAY-13: use a logical property instead of "${property}" (e.g. inset-inline-start, margin-inline-end)` },
    ],
    'declaration-property-value-disallowed-list': [
      {
        // LAY-13: physical keywords.
        '/^(float|clear)$/': ['left', 'right'],
        'text-align': ['left', 'right'],
        // MOT-01: durations come from --sdk-duration-* tokens, never literal times.
        '/^(transition|animation)$/': [/(^|[\s,(])-?[\d.]+m?s\b/],
      },
      { message: (property, value) => `LAY-13/MOT-01: "${property}: ${value}" is not allowed; use a logical keyword or a --sdk-duration-* token` },
    ],
    'declaration-property-value-allowed-list': [
      {
        // TYP-05: every font size is one of the kit's text styles.
        'font-size': [TOKEN('font-size'), 'inherit', '1em', '100%'],
        // Only `font: inherit` (the form reset): the shorthand would hide literal sizes.
        font: ['inherit'],
        // MOT-01: durations and easings come from tokens.
        '/^(transition|animation)-(duration|delay)$/': [TOKEN('duration'), '0s'],
        '/^(transition|animation)-timing-function$/': [TOKEN('ease'), 'linear', 'step-end', 'step-start'],
      },
      { message: (property, value) => `TYP-05/MOT-01: "${property}: ${value}" must use an --sdk-* token` },
    ],
    // TYP-02: font sizes scale with the user's text size.
    'declaration-property-unit-allowed-list': [
      { 'font-size': ['rem', 'em', '%'] },
      { message: (property, unit) => `TYP-02: font-size must use rem, em, or % (got ${unit})` },
    ],
    // TYP-02: points are a print unit; nothing on screen uses them.
    'unit-disallowed-list': [['pt'], { message: () => 'TYP-02: the pt unit is not allowed; use rem for type and tokens for spacing' }],
    // COL-06: colors come from role tokens only.
    'color-no-hex': [true, { message: (hex) => `COL-06: use an --sdk-color-* role token instead of ${hex}` }],
    'color-named': ['never', { message: (name) => `COL-06: use an --sdk-color-* role token instead of "${name}"` }],
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
      { message: (fn) => `COL-06: use an --sdk-color-* role token instead of ${fn}()` },
    ],

    // House style.
    'selector-class-pattern': [
      '^(sdk|pg)-[a-z0-9]+(-[a-z0-9]+)*$',
      { message: (selector) => `classes are kebab-case with an sdk- (kit) or pg- (playground) prefix: ${selector}` },
    ],
    'custom-property-pattern': null,
    'declaration-no-important': null,
    'no-descending-specificity': null,
  },
  overrides: [
    {
      // The design panel lives in a shadow root, so its class names cannot clash with the page.
      files: ['playground/dev/**/*.css'],
      rules: { 'selector-class-pattern': null },
    },
  ],
};
