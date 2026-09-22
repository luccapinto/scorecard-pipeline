#!/usr/bin/env node
// Automated accessibility audit: axe-core against the real, built application.
//
// Run in a browser rather than jsdom on purpose. The rules that matter most
// here — colour contrast, focus order, name-from-content on a rendered layout —
// need real layout and real computed styles, which jsdom does not have. An
// axe run under jsdom silently skips exactly the checks this interface most
// needs to pass.
//
// Both themes are audited, because a contrast regression in dark mode is a
// regression, and demo mode is used because it is the only mode that renders
// every screen with data and without a backend.
//
// Run: npm run build && npm run preview &   then   npm run check:a11y

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

import { BASE_URL, ROUTES, urlFor } from './routes.mjs';

const THEMES = ['light', 'dark'];

// WCAG 2.1 A and AA, which is the bar stated in the README.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

let violationCount = 0;
const summary = [];

for (const theme of THEMES) {
  for (const route of ROUTES) {
    await page.goto(urlFor(route), { waitUntil: 'domcontentloaded' });
    // The theme lives on <html data-theme>, written by usePreferences from
    // localStorage; set the preference and reload so the app owns the value
    // rather than fighting a DOM attribute we poked in.
    await page.evaluate((value) => {
      localStorage.setItem(
        'scorecard-pipeline.prefs',
        JSON.stringify({ theme: value, pollIntervalMs: 5000, lastMode: 'demo' }),
      );
    }, theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(route.wait, { timeout: 15000 });

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    const applied = await page.getAttribute('html', 'data-theme');
    if (applied !== theme) {
      console.error(`✗ ${route.id}: expected data-theme=${theme}, got ${applied}`);
      violationCount += 1;
    }

    if (results.violations.length > 0) {
      console.error(`\n✗ ${theme} · ${route.title} (${route.path})`);
      for (const violation of results.violations) {
        violationCount += 1;
        console.error(`   [${violation.impact}] ${violation.id} — ${violation.help}`);
        for (const node of violation.nodes.slice(0, 3)) {
          console.error(`     ${node.target.join(' ')}`);
          console.error(`     ${node.failureSummary?.split('\n').join(' ')}`);
        }
        console.error(`     ${violation.helpUrl}`);
      }
    } else {
      summary.push(`✓ ${theme} · ${route.title}`);
    }
  }
}

await browser.close();

for (const line of summary) console.log(line);

const checked = THEMES.length * ROUTES.length;
if (violationCount > 0) {
  console.error(
    `\nAccessibility audit FAILED: ${violationCount} violation(s) across ${checked} page/theme combinations.`,
  );
  process.exit(1);
}
console.log(
  `\nAccessibility audit passed: ${checked} page/theme combinations, 0 violations (${TAGS.join(', ')}) at ${BASE_URL}.`,
);
