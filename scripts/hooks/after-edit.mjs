// PostToolUse hook: when a file in packages/shared or packages/tokens changes, run its tests.
// Exit code 2 sends stderr back to the runner so it fixes the break immediately.
import { spawnSync } from 'node:child_process';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let file = '';
try { file = JSON.parse(raw)?.tool_input?.file_path ?? ''; } catch { process.exit(0); }
file = file.replaceAll('\\', '/');

const targets = [
  ['packages/shared/', '@sellekni/shared'],
  ['packages/tokens/', '@sellekni/tokens'],
];
for (const [needle, pkg] of targets) {
  if (!file.includes(needle)) continue;
  const r = spawnSync('pnpm', ['--filter', pkg, 'test'], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(`Tests for ${pkg} FAILED after editing ${file}\n${(r.stdout || '').slice(-3500)}\n${(r.stderr || '').slice(-1500)}`);
    process.exit(2);
  }
}
