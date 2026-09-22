#!/usr/bin/env node
// Verifies that every colour pair the UI actually renders meets WCAG 2.1 AA,
// in BOTH themes, by reading the real token values out of tokens.css.
//
// A design-token file is the only place where a contrast regression can be
// introduced silently: a designer nudges one hex and some label somewhere
// becomes unreadable. Checking the tokens at their source catches it before
// review, and costs nothing (no browser, no dependency).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(here, '../src/styles/tokens.css');

/** Parses `--name: value;` declarations out of one CSS block. */
function parseBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Selector not found in tokens.css: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const vars = {};
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/);
    if (match) vars[match[1]] = match[2].trim();
  }
  return vars;
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

// WCAG relative luminance.
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

// AA thresholds: 4.5 for body text, 3.0 for large text, UI components and
// graphical objects (WCAG 1.4.3 and 1.4.11).
const TEXT = 4.5;
const UI = 3.0;

/** [foreground, background, minimum ratio, what renders this pair] */
const PAIRS = [
  ['--text', '--bg', TEXT, 'body text on page background'],
  ['--text', '--surface', TEXT, 'body text on card'],
  ['--text', '--surface-2', TEXT, 'body text on inset panel'],
  ['--text', '--surface-3', TEXT, 'body text on raised panel'],
  ['--text', '--surface-inset', TEXT, 'body text on inset well'],
  ['--text-muted', '--bg', TEXT, 'secondary text on page'],
  ['--text-muted', '--surface', TEXT, 'secondary text on card'],
  ['--text-muted', '--surface-2', TEXT, 'secondary text on inset panel'],
  ['--text-faint', '--surface', TEXT, 'tertiary text on card'],
  ['--text-faint', '--bg', TEXT, 'tertiary text on page'],

  ['--accent', '--surface', TEXT, 'link on card'],
  ['--accent', '--bg', TEXT, 'link on page'],
  ['--accent-text', '--accent-soft', TEXT, 'accent text on accent chip'],
  ['--text-inverse', '--accent', TEXT, 'primary button label'],
  ['--focus-ring', '--bg', UI, 'focus ring on page'],
  ['--focus-ring', '--surface', UI, 'focus ring on card'],

  ['--ok', '--ok-soft', TEXT, 'success text on success chip'],
  ['--ok', '--surface', TEXT, 'success text on card'],
  ['--warn', '--warn-soft', TEXT, 'warning text on warning chip'],
  ['--warn', '--surface', TEXT, 'warning text on card'],
  ['--danger', '--danger-soft', TEXT, 'danger text on danger chip'],
  ['--danger', '--surface', TEXT, 'danger text on card'],
  ['--info', '--info-soft', TEXT, 'info text on info chip'],
  ['--info', '--surface', TEXT, 'info text on card'],
  ['--neutral', '--neutral-soft', TEXT, 'neutral text on neutral chip'],
  ['--neutral', '--surface', TEXT, 'neutral text on card'],

  ['--border-strong', '--surface', UI, 'input border on card'],
  ['--border-strong', '--bg', UI, 'input border on page'],

  ['--speaker-0', '--surface', TEXT, 'speaker 0 label'],
  ['--speaker-1', '--surface', TEXT, 'speaker 1 label'],
  ['--speaker-2', '--surface', TEXT, 'speaker 2 label'],
  ['--speaker-3', '--surface', TEXT, 'speaker 3 label'],
  ['--speaker-4', '--surface', TEXT, 'speaker 4 label'],
  ['--speaker-5', '--surface', TEXT, 'speaker 5 label'],

  ['--chart-1', '--surface', UI, 'chart series 1'],
  ['--chart-2', '--surface', UI, 'chart series 2'],
  ['--chart-3', '--surface', UI, 'chart series 3'],
  ['--chart-4', '--surface', UI, 'chart series 4'],
  ['--chart-5', '--surface', UI, 'chart series 5'],
];

const css = readFileSync(TOKENS, 'utf8');
const themes = {
  light: parseBlock(css, ':root,\n[data-theme=\'light\']'),
  dark: parseBlock(css, '[data-theme=\'dark\']'),
};

let failures = 0;
let checked = 0;

for (const [themeName, vars] of Object.entries(themes)) {
  for (const [fgVar, bgVar, min, what] of PAIRS) {
    const fg = vars[fgVar];
    const bg = vars[bgVar];
    if (!fg || !bg) {
      console.error(`✗ ${themeName}: missing token ${!fg ? fgVar : bgVar}`);
      failures += 1;
      continue;
    }
    const ratio = contrast(fg, bg);
    checked += 1;
    if (ratio < min) {
      failures += 1;
      console.error(
        `✗ ${themeName}: ${what} — ${fgVar} (${fg}) on ${bgVar} (${bg}) = ` +
          `${ratio.toFixed(2)}:1, needs ${min}:1`,
      );
    } else if (process.env.VERBOSE) {
      console.log(`✓ ${themeName}: ${what} = ${ratio.toFixed(2)}:1`);
    }
  }
}

if (failures > 0) {
  console.error(`\nContrast check FAILED: ${failures} pair(s) below WCAG AA.`);
  process.exit(1);
}
console.log(`Contrast check passed: ${checked} pairs across 2 themes meet WCAG 2.1 AA.`);
