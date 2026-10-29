#!/usr/bin/env node
// Stop / SubagentStop hook: a session working an issue must write its .agent-log entry
// before it finishes. Exit 2 sends the message on stderr back to Claude; exit 0 lets it stop.
//
// Only applies on branches named issue/<number>-<slug>. Blocks at most once per stop
// (stop_hook_active), so a child that is genuinely stuck can still hand back to you.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const allow = () => process.exit(0);

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  allow();
}
if (input.stop_hook_active) allow();

const cwd = input.cwd || process.cwd();
const git = (...args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const root = git('rev-parse', '--show-toplevel');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const match = branch && branch.match(/^issue\/(\d+)(?:-|$)/);
if (!root || !match) allow();

const issue = match[1];
const entry = join(root, '.agent-log', 'issues', `${issue}.md`);
if (existsSync(entry)) allow();

// Integration branch comes from CLAUDE.md so there's one place to change it.
let base = 'main';
try {
  const m = readFileSync(join(root, 'CLAUDE.md'), 'utf8').match(/Integration branch: `([^`]+)`/);
  if (m) base = m[1];
} catch {
  /* keep default */
}

// Nothing done yet (e.g. the child is asking a question first): don't block.
const ref = git('rev-parse', '--verify', '--quiet', `origin/${base}`) ? `origin/${base}` : base;
const commits = git('rev-list', '--count', `${ref}..HEAD`);
const dirty = git('status', '--porcelain');
const didWork = (commits && Number(commits) > 0) || (dirty && dirty.length > 0);
if (!didWork) allow();

process.stderr.write(
  `You're on ${branch} but .agent-log/issues/${issue}.md doesn't exist yet. ` +
    `Before finishing, write it from .agent-log/TEMPLATE.md (status done, blocked or needs review) ` +
    `and commit it on this branch, as described under "Work log rules" in CLAUDE.md.\n`,
);
process.exit(2);
