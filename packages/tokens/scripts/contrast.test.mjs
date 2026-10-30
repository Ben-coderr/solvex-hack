import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, tokens as t } from './lib.mjs';

const AA = 4.5;   // normal text
const AA_UI = 3;  // large text / UI components / focus rings

test('body text and muted text on every surface (AA, text >= 7:1 AAA)', () => {
  for (const m of ['dark', 'light']) {
    const c = t.color[m];
    for (const s of ['bg', 'surface', 'raised']) {
      assert.ok(contrast(c.text, c[s]) >= 7, `${m}.text on ${s}: ${contrast(c.text, c[s]).toFixed(2)}`);
      assert.ok(contrast(c.muted, c[s]) >= AA, `${m}.muted on ${s}: ${contrast(c.muted, c[s]).toFixed(2)}`);
    }
  }
});

test('brand text and brand button', () => {
  for (const m of ['dark', 'light']) {
    const c = t.color[m];
    for (const s of ['bg', 'surface', 'raised']) {
      assert.ok(contrast(c.brandText, c[s]) >= AA, `${m}.brandText on ${s}: ${contrast(c.brandText, c[s]).toFixed(2)}`);
    }
    assert.ok(contrast(c.onBrand, c.brandFill) >= AA, `${m} onBrand/brandFill: ${contrast(c.onBrand, c.brandFill).toFixed(2)}`);
  }
});

test('every triage fill has AA letter on top (the letter is mandatory, not decoration)', () => {
  for (const b of Object.keys(t.color.triage)) {
    const r = contrast(t.color.onTriage[b], t.color.triage[b]);
    assert.ok(r >= AA, `triage ${b}: ${r.toFixed(2)}`);
  }
});

test('triage markers are visible as UI components (>= 3:1): by fill, or by a mandatory outline', () => {
  for (const m of ['dark', 'light']) {
    const c = t.color[m];
    for (const b of Object.keys(t.color.triage)) {
      const fill = contrast(t.color.triage[b], c.bg);
      if (fill >= AA_UI) continue;
      assert.ok(c.triageOutline.startsWith('#'), `${b} on ${m}.bg is ${fill.toFixed(2)}:1 and has no outline`);
      assert.ok(contrast(c.triageOutline, c.bg) >= AA_UI, `${m} outline vs bg`);
    }
  }
  // Dark mode needs no outline: every fill passes on its own.
  for (const b of Object.keys(t.color.triage)) assert.ok(contrast(t.color.triage[b], t.color.dark.bg) >= AA_UI, `dark ${b}`);
});

test('borders are visible but quiet (>= 1.3:1 against bg)', () => {
  for (const m of ['dark', 'light']) assert.ok(contrast(t.color[m].line, t.color[m].bg) >= 1.3);
});

test('brand hue is not a triage hue (brand must never be mistaken for a band)', () => {
  const hue = (hex) => {
    const n = parseInt(hex.slice(1), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const brandHue = hue(t.color.brand[500]);
  for (const b of ['R', 'O', 'Y', 'G']) {
    const diff = Math.min(Math.abs(brandHue - hue(t.color.triage[b])), 360 - Math.abs(brandHue - hue(t.color.triage[b])));
    assert.ok(diff >= 60, `brand hue ${brandHue.toFixed(0)} too close to ${b} (${hue(t.color.triage[b]).toFixed(0)})`);
  }
});
