// The pinned Playwright image: the browsers, fonts, and OS that render the
// visual baselines. Its tag always matches the installed @playwright/test, so
// upgrading Playwright in package.json moves the image with it.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const PLAYWRIGHT_VERSION = require('@playwright/test/package.json').version;
export const PLAYWRIGHT_IMAGE = `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`;
