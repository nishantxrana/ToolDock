#!/usr/bin/env node
/**
 * Verifies text/background token pairs in src/index.css against WCAG 2.x and APCA.
 * Usage: node scripts/contrast.mjs   (exits 1 if any pair fails its target)
 *
 * APCA math follows APCA-W3 0.0.98G-4g (https://github.com/Myndex/apca-w3).
 * Targets: body text Lc >= 75, secondary text / status text Lc >= 60, and WCAG >= 4.5:1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8');

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n  }', start);
  const vars = {};
  for (const m of css
    .slice(start, end)
    .matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return vars;
}

function hslToRgb([h, s, l]) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const wcagLum = (rgb) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const wcag = (a, b) => {
  const [hi, lo] = [wcagLum(a), wcagLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function apcaY([r, g, b]) {
  let y = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
  if (y < 0.022) y += (0.022 - y) ** 1.414;
  return y;
}
function apca(text, bg) {
  const yt = apcaY(text);
  const yb = apcaY(bg);
  let s;
  if (yb > yt) {
    s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

// [text token, background token, min |Lc|]
const PAIRS = [
  ['foreground', 'background', 75],
  ['foreground', 'card', 75],
  ['foreground', 'popover', 75],
  ['foreground', 'muted', 75],
  ['muted-foreground', 'background', 60],
  ['muted-foreground', 'card', 60],
  ['muted-foreground', 'muted', 55],
  ['muted-foreground', 'sidebar', 60],
  ['primary', 'card', 60],
  ['primary', 'background', 60],
  ['primary-foreground', 'primary', 60],
  ['accent-foreground', 'accent', 60],
  ['success', 'card', 60],
  ['success', 'success-subtle', 60],
  ['warning', 'card', 60],
  ['warning', 'warning-subtle', 60],
  ['destructive', 'card', 60],
  ['destructive', 'destructive-subtle', 60],
  ['info', 'card', 60],
  ['info', 'info-subtle', 60],
  ['destructive-foreground', 'destructive', 60],
];

let failed = 0;
for (const theme of [':root', '.dark']) {
  const v = block(theme);
  console.log(`\n${theme === ':root' ? 'Light' : 'Dark'} theme`);
  for (const [t, b, min] of PAIRS) {
    if (!v[t] || !v[b]) continue;
    const ft = hslToRgb(v[t]);
    const bg = hslToRgb(v[b]);
    const lc = Math.abs(apca(ft, bg));
    const ratio = wcag(ft, bg);
    const ok = lc >= min && ratio >= 4.5;
    if (!ok) failed++;
    console.log(
      `${ok ? '  ok ' : ' FAIL'}  ${t.padEnd(22)} on ${b.padEnd(19)} Lc ${lc.toFixed(1).padStart(5)} (min ${min})  ${ratio.toFixed(2)}:1`,
    );
  }
}
console.log(failed ? `\n${failed} pair(s) below target` : '\nAll pairs meet target');
process.exit(failed ? 1 : 0);
