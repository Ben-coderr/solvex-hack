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

test('status colours: AA text on every surface, and never a triage hue (>= 30 deg away)', () => {
  const hue = (hex) => {
    const n = parseInt(hex.slice(1), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  for (const m of ['dark', 'light']) {
    const c = t.color[m];
    for (const k of ['statusOk', 'statusWarn', 'statusDanger', 'statusInfo']) {
      for (const s of ['bg', 'surface', 'raised']) assert.ok(contrast(c[k], c[s]) >= AA, `${m}.${k} on ${s}: ${contrast(c[k], c[s]).toFixed(2)}`);
      for (const b of ['R', 'O', 'Y', 'G']) {
        const d = Math.abs(hue(c[k]) - hue(t.color.triage[b]));
        assert.ok(Math.min(d, 360 - d) >= 30, `${m}.${k} hue too close to triage ${b}`);
      }
    }
  }
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

// ---- Sellekni logo rules (decision 2026-10-30: mono logo inside the product) -------------------
test('mono logo is legible on every surface in both themes (>= 7:1)', () => {
  for (const m of ['dark', 'light']) {
    const c = t.color[m];
    for (const s of ['bg', 'surface', 'raised']) {
      assert.ok(contrast(c.logoMono, c[s]) >= 7, `${m}.logoMono on ${s}: ${contrast(c.logoMono, c[s]).toFixed(2)}`);
    }
  }
});

test('logo red is confusable with triage R, so it must stay out of the product UI', () => {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [rgb(t.color.logo.red), rgb(t.color.triage.R)];
  const dist = Math.hypot(...a.map((v, i) => v - b[i]));
  assert.ok(dist < 60, `if this fails the logo red moved away from triage R (${dist.toFixed(0)}); revisit docs/12 section 2.3`);
  // Guard: the build must never expose it as a CSS custom property or Tailwind colour.
  assert.ok(!JSON.stringify(Object.keys(t.color.dark)).includes('logoRed'));
  assert.ok(!JSON.stringify(Object.keys(t.color.light)).includes('logoRed'));
});

test('text on the logo red is LARGE text only (>= 3:1); normal text would fail AA', () => {
  assert.ok(contrast(t.color.logo.white, t.color.logo.red) >= AA_UI, 'white on logo red');
  assert.ok(contrast(t.color.logo.ink, t.color.logo.red) >= AA_UI, 'ink on logo red');
  assert.ok(contrast(t.color.logo.white, t.color.logo.red) < AA, 'if this now passes AA, relax docs/12 finding 3');
});

test('logo red on the dark surface is usable as a graphic (>= 3:1)', () => {
  assert.ok(contrast(t.color.logo.red, t.color.dark.bg) >= AA_UI);
});
