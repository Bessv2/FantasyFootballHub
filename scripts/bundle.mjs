/**
 * Concatenates the whole codebase into one readable file.
 *
 *   npm run bundle        -> SOURCE-BUNDLE.md
 *
 * The point is portability: one file you can open on GitHub, read end to end,
 * or paste into a fresh session to bring it fully up to speed without needing
 * this conversation.
 *
 * The header stamps the git SHA and generation time, because a stale bundle
 * that looks current is worse than no bundle — check the SHA against the repo
 * before trusting it.
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { projectRoot } from './lib/espn.mjs';

const ROOT = projectRoot();
const OUT = path.join(ROOT, 'SOURCE-BUNDLE.md');

/** Directories worth walking, in the order a reader should meet them. */
const SECTIONS = [
  {
    title: 'Configuration',
    blurb: 'League identity, the public money rules, and templates. Real credentials (config/secrets.json) and the private ledger (config/money.json: names and who has paid) are gitignored and never appear here.',
    // Never add config/money.json: this file is committed to a public repo.
    files: ['config/league.json', 'config/pot.json', 'config/money.example.json', 'config/secrets.example.json'],
  },
  {
    title: 'Data layer — talking to ESPN',
    blurb: 'Everything that knows ESPN exists. The API is undocumented, so most of the hard-won knowledge in this project is concentrated in these three files.',
    files: ['scripts/lib/espn.mjs', 'scripts/lib/constants.mjs', 'scripts/lib/normalize.mjs'],
  },
  {
    title: 'Analytics',
    blurb: 'Pure functions over the normalized model. No I/O, no ESPN knowledge, fully unit-tested.',
    files: [
      'scripts/lib/lineup.mjs',
      'scripts/lib/analytics.mjs',
      'scripts/lib/challenges.mjs',
      'scripts/lib/draft.mjs',
      'scripts/lib/advisor.mjs',
      'scripts/lib/bigboard.mjs',
      'scripts/lib/images.mjs',
      'scripts/lib/playercard.mjs',
      'scripts/lib/money.mjs',
      'scripts/lib/odds.mjs',
      'scripts/lib/trades.mjs',
      'scripts/lib/recap.mjs',
      'scripts/lib/h2h.mjs',
      'scripts/lib/newscache.mjs',
    ],
  },
  {
    title: 'Pipeline scripts',
    blurb: 'The commands you actually run. fetch -> build -> serve, plus the automation and diagnostics.',
    files: [
      'scripts/check.mjs',
      'scripts/fetch.mjs',
      'scripts/build.mjs',
      'scripts/serve.mjs',
      'scripts/ship.mjs',
      'scripts/myleagues.mjs',
      'scripts/fixtures.mjs',
    ],
  },
  {
    title: 'Site',
    blurb: 'Dependency-free front end. Reads pre-computed JSON from docs/data/ and renders it.',
    files: ['docs/index.html', 'docs/assets/style.css', 'docs/assets/app.js', 'docs/assets/mock.js', 'docs/_headers'],
  },
  {
    title: 'Tests',
    blurb: 'The only thing standing between "the maths is right" and "the maths runs" — the league has no real data until the Sept 5 2026 draft.',
    files: [
      'tests/analytics.test.mjs',
      'tests/challenges.test.mjs',
      'tests/images.test.mjs',
      'tests/playercard.test.mjs',
      'tests/normalize.test.mjs',
      'tests/odds.test.mjs',
      'tests/trades.test.mjs',
      'tests/recap.test.mjs',
      'tests/h2h.test.mjs',
      'tests/newscache.test.mjs',
    ],
  },
  {
    title: 'Automation',
    blurb: 'Daily GitHub Actions run: fetch, build, test, commit only on change.',
    files: ['.github/workflows/update.yml', 'package.json'],
  },
];

const LANG = {
  '.mjs': 'javascript', '.js': 'javascript', '.json': 'json',
  '.css': 'css', '.html': 'html', '.yml': 'yaml', '.md': 'markdown',
};

function gitInfo() {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const date = execFileSync('git', ['log', '-1', '--format=%ci'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return { sha, date, dirty: dirty.length > 0 };
  } catch {
    return { sha: 'unknown', date: 'unknown', dirty: false };
  }
}

async function main() {
  const git = gitInfo();
  const out = [];
  let totalLines = 0;
  let fileCount = 0;

  out.push('# Fantasy Football Hub — complete source');
  out.push('');
  out.push('Every source file in one place, for reading or for handing to a fresh session.');
  out.push('');
  out.push(`- **Commit:** \`${git.sha}\` (${git.date})`);
  out.push(`- **Generated:** ${new Date().toISOString()}`);
  if (git.dirty) {
    out.push('- **WARNING:** the working tree had uncommitted changes when this was generated, so this may not match any commit.');
  }
  out.push('- **Regenerate with:** `npm run bundle`');
  out.push('');
  out.push('**Read [HANDOFF.md](HANDOFF.md) first.** It carries the ESPN API gotchas,');
  out.push('the decisions that look wrong until explained, and what is verified versus');
  out.push('merely assumed. None of that is inferable from the code below.');
  out.push('');
  out.push('> Check the commit above against the repo before trusting this file. A');
  out.push('> stale bundle that looks current is worse than no bundle at all.');
  out.push('');
  out.push('Excluded: `config/secrets.json` (credentials), `config/money.json` (private ledger), `data/` (raw API cache and');
  out.push('fixtures, both regenerable), `docs/data/` (build output).');
  out.push('');
  out.push('---');
  out.push('');

  // Table of contents
  out.push('## Contents');
  out.push('');
  for (const section of SECTIONS) {
    out.push(`- **${section.title}** — ${section.files.map((f) => `\`${path.basename(f)}\``).join(', ')}`);
  }
  out.push('');
  out.push('---');
  out.push('');

  for (const section of SECTIONS) {
    out.push(`## ${section.title}`);
    out.push('');
    out.push(section.blurb);
    out.push('');

    for (const rel of section.files) {
      const abs = path.join(ROOT, rel);
      let content;
      try {
        content = await readFile(abs, 'utf8');
      } catch {
        continue; // File not present — skip rather than fail the bundle.
      }
      const lines = content.split('\n').length;
      totalLines += lines;
      fileCount += 1;

      out.push(`### \`${rel}\``);
      out.push('');
      out.push(`*${lines} lines*`);
      out.push('');
      out.push('```' + (LANG[path.extname(rel)] ?? ''));
      out.push(content.replace(/\s+$/, ''));
      out.push('```');
      out.push('');
    }
  }

  out.push('---');
  out.push('');
  out.push(`*${fileCount} files, ${totalLines.toLocaleString()} lines.*`);
  out.push('');

  await writeFile(OUT, out.join('\n'), 'utf8');

  const kb = (Buffer.byteLength(out.join('\n')) / 1024).toFixed(0);
  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  console.log(`  ${fileCount} files, ${totalLines.toLocaleString()} lines, ${kb} KB`);
  console.log(`  commit ${git.sha}${git.dirty ? ' (working tree dirty)' : ''}\n`);
}

main().catch((error) => {
  console.error(`Bundle failed: ${error.message}`);
  process.exitCode = 1;
});
