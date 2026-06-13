#!/usr/bin/env node
/**
 * Interactive version bump script — runs as a Husky pre-commit hook.
 *
 * Prompts for: patch | minor | major | none
 * On selection:
 *   - Increments version in package.json
 *   - Prepends a dated entry to docs/changelog/CHANGELOG.md
 *   - Stages both files so they are included in the commit
 */

import { createInterface } from 'readline';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default:      throw new Error(`Unknown bump type: ${type}`);
  }
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function prependChangelog(changelogPath, version) {
  const existing = readFileSync(changelogPath, 'utf8');
  const entry = [
    `## [${version}] — ${today()}`,
    '',
    '### Changed',
    '',
    '- (describe your changes here)',
    '',
    '---',
    '',
  ].join('\n');

  // Insert after the first "---" separator (below the header block)
  const insertAfter = '---\n\n## [Unreleased]';
  const updated = existing.replace(
    '## [Unreleased]',
    `## [Unreleased]\n\n---\n\n${entry}`
  );

  if (updated === existing) {
    // Fallback: prepend after the top-level "---"
    const parts = existing.split('---\n');
    parts.splice(1, 0, `\n${entry}`);
    writeFileSync(changelogPath, parts.join('---\n'), 'utf8');
  } else {
    writeFileSync(changelogPath, updated, 'utf8');
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

const pkgPath       = resolve(ROOT, 'package.json');
const changelogPath = resolve(ROOT, 'docs/changelog/CHANGELOG.md');

const pkg     = readJson(pkgPath);
const current = pkg.version;

process.stdout.write(`\nCurrent backend version: ${current}\n`);
process.stdout.write('Select version bump type:\n');
process.stdout.write('  [1] patch  — bug fix / refactor / docs  (x.y.Z)\n');
process.stdout.write('  [2] minor  — new feature / module        (x.Y.0)\n');
process.stdout.write('  [3] major  — breaking / architecture     (X.0.0)\n');
process.stdout.write('  [4] none   — skip version bump\n');
process.stdout.write('\nChoice (1/2/3/4): ');

rl.once('line', (answer) => {
  rl.close();

  const choice = answer.trim();

  if (choice === '4' || choice === '') {
    process.stdout.write('Version bump skipped.\n\n');
    process.exit(0);
  }

  const typeMap = { '1': 'patch', '2': 'minor', '3': 'major' };
  const bumpType = typeMap[choice];

  if (!bumpType) {
    process.stderr.write(`Invalid choice "${choice}". Aborting commit.\n`);
    process.exit(1);
  }

  const next = bumpVersion(current, bumpType);

  // Update package.json
  pkg.version = next;
  writeJson(pkgPath, pkg);

  // Update changelog
  prependChangelog(changelogPath, next);

  // Stage both files
  execSync(`git add "${pkgPath}" "${changelogPath}"`, { cwd: ROOT });

  process.stdout.write(`\nVersion bumped: ${current} → ${next}  (${bumpType})\n`);
  process.stdout.write(`CHANGELOG.md updated — fill in the entry after committing.\n\n`);

  process.exit(0);
});
