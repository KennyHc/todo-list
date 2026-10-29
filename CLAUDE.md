# Tasks app — instructions for every Claude session

A React 18 + TypeScript + Vite PWA for nested tasks (difficulty, tags, deadlines, history),
with optional Firebase cloud sync. State lives in zustand stores.

## Where things are

- `src/components/` UI components, each with a `*.module.css` next to it
- `src/store/` zustand stores (`tasks.ts` is the core one)
- `src/lib/` pure helpers; unit tests sit next to them as `*.test.ts`
- `src/sync/` Firestore sync (diff, apply, schema)
- `e2e/` Playwright specs, run against the Firebase emulators
- `firestore.rules` security rules; any change here needs an emulator test

## Commands

Run the fast checks before every commit. They match the `check` job in CI.

```
npx prettier --check src e2e   # fix with: npm run format
npm run lint
npm test
npm run build
npm run check:bundle
npm run typecheck:e2e
```

Slower checks, run when you touch sync, Firestore rules or user flows (needs Java 21):

```
npm run test:emulators
npm run test:e2e
```

## Code style

- Prettier: single quotes, semicolons, trailing commas, width 100.
- Follow the patterns in neighbouring files. New helpers in `src/lib/` get a `*.test.ts`.
- Don't add dependencies without saying why in the PR.

## Branches

- Integration branch: `feat/cloud-sync`. Branch from it and open PRs against it.
  (Update this line once that work is merged into `main`.)
- Never commit or push directly to `main` or the integration branch.

---

# Multi-agent workflow

One **master session** coordinates. It starts one **child** per GitHub issue. Children never talk
to each other; they report back to the master.

## Master session

- Find work with `gh issue list --label agent:ready --state open`.
- Before starting a child, skim the log index (see Work log rules) and pass the child the
  numbers of any related entries.
- One child per issue. At most 3 children at a time unless the user says otherwise.
- Skip issues that are vague, too big for one PR, or overlap a running child; tell the user why.
- When a child reports back, check that its PR exists and that the PR contains its log entry.
  Then swap the issue label: remove `agent:ready`, add `agent:done` or `agent:blocked`.
- The master does not write code or commit. It reads, delegates, checks and reports.
- End every round with a summary for the user: issue, PR, status, anything waiting on them.

## Child session (one per issue)

1. Read the issue (`gh issue view <n>`), the log index, `.agent-log/decisions.md`, and any log
   entries the master pointed to.
2. Create a branch `issue/<n>-<short-slug>` from the integration branch.
3. Make the smallest change that resolves the issue. Stay inside its scope.
4. Run the fast checks above. Don't open a PR with failing checks.
5. Write `.agent-log/issues/<n>.md` using `.agent-log/TEMPLATE.md`, and commit it on the same
   branch as the change.
6. Push the branch and open a PR against the integration branch with `Closes #<n>` in the body.
   Paste the log entry's Summary into the PR description.
7. Report back to the master: PR link, status, open questions.

**If blocked** (the issue is unclear, too big, or checks fail and you can't see why): stop. Don't
guess or invent scope. Write the log entry with status `blocked` and the reason, comment the
question on the issue, and report back.

## Work log rules

- `.agent-log/` is the shared memory between agents. It is committed, so keep it accurate.
- One file per issue: `.agent-log/issues/<n>.md`. The first four lines are a fixed header
  (see the template), so this command is the index of everything done so far:
  `head -n 4 .agent-log/issues/*.md`
- Entries are short: 40 lines at most. Record what a future agent needs, not a diary.
- Decisions that apply beyond one issue go in `.agent-log/decisions.md`, one line each. If two
  PRs both add lines there and conflict, keep both lines.
- Never rewrite another issue's entry. If you learn something that changes it, say so in yours.
