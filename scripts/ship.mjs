/**
 * The whole weekly routine, in one command: fetch, build, commit, push.
 *
 *   npm run ship
 *   npm run ship -- "custom commit message"
 *
 * Exists mainly so the update flow is one thing to remember rather than four,
 * and so it works identically in PowerShell, cmd, and bash — Windows
 * PowerShell 5.1 does not support `&&`, which makes the usual chained
 * one-liner a syntax error there.
 */

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './lib/espn.mjs';

const ROOT = projectRoot();
const customMessage = process.argv.slice(2).join(' ').trim();

/** Runs a command, streaming output. Returns the exit code. */
function run(command, args, { allowFailure = false } = {}) {
  // On Windows, quote the command if it contains spaces (like Node.js path)
  const quotedCommand = process.platform === 'win32' && command.includes(' ') 
    ? `"${command}"`
    : command;
  
  const result = spawnSync(quotedCommand, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 && !allowFailure) {
    console.error(`\n${command} ${args.join(' ')} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
  return result.status ?? 1;
}

/** Captures stdout instead of streaming it. */
function capture(command, args) {
  const quotedCommand = process.platform === 'win32' && command.includes(' ')
    ? `"${command}"`
    : command;
  
  const result = spawnSync(quotedCommand, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return (result.stdout ?? '').trim();
}

/** Names the commit after where the season actually is. */
async function describeState() {
  if (customMessage) return customMessage;

  const hubFile = path.join(ROOT, 'docs', 'data', 'hub.json');
  if (!existsSync(hubFile)) return 'Update league data';

  try {
    const hub = JSON.parse(await readFile(hubFile, 'utf8'));
    const weeks = hub.status?.weeksPlayed ?? 0;
    const claimed = (hub.teams ?? []).filter((t) => !t.isPlaceholder).length;
    const size = hub.league?.size ?? 0;

    if (weeks > 0) return `Week ${weeks}`;
    if (hub.status?.phase === 'DRAFTED') return 'Draft results';
    return `Preseason — ${claimed}/${size} managers joined`;
  } catch {
    return 'Update league data';
  }
}

console.log('\n=== 1/4  Fetching from ESPN ===\n');
run(process.execPath, ['scripts/fetch.mjs']);

console.log('\n=== 2/4  Building ===\n');
run(process.execPath, ['scripts/build.mjs']);

console.log('\n=== 3/4  Committing ===\n');
run('git', ['add', '-A']);

// `git diff --cached --quiet` exits 1 when there IS something staged.
const hasChanges = capture('git', ['diff', '--cached', '--name-only']).length > 0;

if (!hasChanges) {
  console.log('Nothing changed since the last run — no commit needed.');
} else {
  const message = await describeState();
  run('git', ['commit', '-m', message]);
  console.log(`\nCommitted: ${message}`);
}

console.log('\n=== 4/4  Pushing ===\n');
const pushStatus = run('git', ['push'], { allowFailure: true });

if (pushStatus !== 0) {
  console.error('\nPush failed. Common causes:');
  console.error('  - Not authenticated: run `git push` once on its own to sign in.');
  console.error('  - No upstream set: run `git push -u origin main` once.');
  console.error('  - Remote has newer commits: run `git pull --rebase` first.');
  process.exit(pushStatus);
}

console.log('\nDone. Cloudflare will redeploy in about a minute.\n');
