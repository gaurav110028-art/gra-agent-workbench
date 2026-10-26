import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const luminance = hex => {
  const c = hex.match(/[a-f\d]{2}/gi).map(s => parseInt(s, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
};
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
test('Shared normal text and primary button tokens meet 4.5:1 contrast in both themes, including hover', () => {
  const dark = css.match(/\.workbench\.darkTheme\s*\{([\s\S]*?)\n\}/)[1];
  const light = css.match(/\.workbench\.lightTheme\s*\{([\s\S]*?)\n\}/)[1];
  const tokens = body => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})\s*;/gi)].map(m => [m[1], m[2]]));
  const themes = [tokens(dark), { ...tokens(dark), ...tokens(light) }];
  for (const theme of themes) {
    for (const foreground of ['text-primary', 'text-secondary', 'text-muted']) for (const background of ['bg-main', 'bg-surface', 'bg-surface-2']) assert(contrast(theme[foreground], theme[background]) >= 4.5, `${foreground}/${background}`);
    for (const background of ['accent', 'accent-hover']) assert(contrast(theme['text-on-accent'], theme[background]) >= 4.5, `primary ${background}`);
  }
});
