#!/usr/bin/env node
// Retire the internal codename: najda → sellekni in code, config, paths and current docs (decision 24h-H5).
//
//   node scripts/rename-codename.mjs            # DRY RUN: per-file counts, paths to move, kept history lines
//   node scripts/rename-codename.mjs --write    # apply (git mv for paths), then: pnpm install, pnpm tokens, pnpm check
//
// Case-preserving: najda → sellekni, NAJDA → SELLEKNI, Najda → Sellekni (so NajdaNative → SellekniNative).
// KEPT on purpose (history must not lie):
//   - DECISIONS.md, docs/11 and docs/12: decision/correction logs
//   - any line containing the old wire magic NAJDA1 (the NAJDA1 → SLK1 history)
//   - the outer folder name `najda-pack` (it is not in the repo)
// Generated files are NOT patched: pnpm-lock.yaml (pnpm install), packages/tokens/dist (pnpm tokens).
// The wire magic SLK1 and every CRC are untouched: `pnpm vectors` must give an empty diff.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const WRITE = process.argv.includes('--write');
const SKIP_FILES = new Set(['DECISIONS.md', 'pnpm-lock.yaml', 'scripts/rename-codename.mjs']);
const SKIP_PREFIX = ['docs/11-', 'docs/12-', 'packages/tokens/dist/'];
const KEEP_LINE = /NAJDA1|najda-pack/;
const BINARY = /\.(png|jpe?g|webp|gif|ico|pmtiles|ttf|otf|woff2?|zip|pdf)$/i;

const rename = (s) => s.replace(/najda/g, 'sellekni').replace(/NAJDA/g, 'SELLEKNI').replace(/Najda/g, 'Sellekni');

const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean);
const report = [];
const kept = [];
let total = 0;

for (const f of files) {
  if (BINARY.test(f) || SKIP_FILES.has(f) || SKIP_PREFIX.some((p) => f.startsWith(p)) || !existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  if (!/najda/i.test(text)) continue;
  let n = 0;
  const out = text.split('\n').map((line, i) => {
    if (!/najda/i.test(line)) return line;
    if (KEEP_LINE.test(line)) {
      kept.push(`${f}:${i + 1}`);
      return line;
    }
    n += line.match(/najda/gi).length;
    return rename(line);
  }).join('\n');
  if (n === 0) continue;
  total += n;
  report.push([f, n]);
  if (WRITE) writeFileSync(f, out);
}

// paths: deepest first so a moved directory does not invalidate its children's paths
const moves = [...new Set(files.filter((f) => /najda/i.test(f) && !SKIP_FILES.has(f)).flatMap((f) => {
  const parts = f.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/')).filter((p) => /najda/i.test(p.split('/').at(-1)));
}))].sort((a, b) => b.split('/').length - a.split('/').length);

console.log(`${WRITE ? 'CHANGED' : 'WOULD CHANGE'} ${total} occurrences in ${report.length} files`);
for (const [f, n] of report.sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${f}`);
console.log(`\nPATHS (${moves.length}):`);
for (const p of moves) {
  const parts = p.split('/');
  const to = [...parts.slice(0, -1), rename(parts.at(-1))].join('/');
  console.log(`  ${p} → ${to}`);
  if (WRITE) {
    mkdirSync(dirname(to), { recursive: true });
    execSync(`git mv ${JSON.stringify(p)} ${JSON.stringify(to)}`);
  }
}
console.log(`\nKEPT as history (${kept.length} lines with NAJDA1 / najda-pack), plus DECISIONS.md, docs/11, docs/12:`);
for (const k of kept) console.log(`  ${k}`);
if (!WRITE) console.log('\nDry run. Re-run with --write, then: pnpm install && pnpm tokens && pnpm check');
