<div align="center">

# Tasks

**A fast, keyboard-first task app for nested projects: type it the way you'd say it, see your
day and week at a glance, and pick up on any device.**

[![CI](https://github.com/KennyHc/todo-list/actions/workflows/ci.yml/badge.svg?event=pull_request)](https://github.com/KennyHc/todo-list/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline_ready-5A0FC8?logo=pwa&logoColor=white)
![Firebase](https://img.shields.io/badge/Firestore-cloud_sync-FFCA28?logo=firebase&logoColor=black)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/desktop-dark-tree.webp" />
  <img src="docs/screenshots/desktop-light-tree.webp" width="760" alt="The Tree view on desktop: two projects with nested subtasks, each with a due date, a coloured tag and a difficulty meter, and a point total on each parent" />
</picture>

</div>

## What it does

- **Nested tasks, any depth.** Projects break down into subtasks; a parent shows its progress
  (`1/5`) and the total points left in it (`Σ 10`).
- **Difficulty as points.** Every task is 1 to 5 (Trivial to Huge). A "Huge" task nudges you to
  break it down, and the header shows your total open load.
- **Quick add that understands you.** `Renew passport from nov 2 by nov 20 #admin !2` becomes a
  task with a start date, a due date, a tag and a difficulty, each shown as a dismissible chip
  before you press Enter.
- **Recurring tasks.** `every friday`, `weekdays`, `monthly`…: finishing one schedules the next.
- **Five views.** Tree, By deadline (Overdue, Today, Tomorrow, This week, Later), Week (a Mon to Sun
  calendar), History (what you finished, and when), and an opt-in Today view.
- **A daily capacity.** Today shows points done against a capacity you set, and offers to move
  something to tomorrow when you're over.
- **Tags with colours, deadlines, notes and hide-until dates**, plus a one-tap Reschedule menu.
- **Command palette** (`⌘K` / `Ctrl+K`) with fuzzy search over tasks and commands.
- **Keyboard everything.** `j`/`k` to move, `x` to complete, `Alt+→` to indent, `1` to `5` to
  switch views, `?` for the full list.
- **Undo** from a toast for completions (including cascades through subtasks), moves, deletes,
  reschedules and imports.
- **Phone-native.** Swipe rows, bottom-sheet menus, a composer above the keyboard, and an
  installable PWA that starts offline, with a "New task" shortcut and Android share target.
- **Cloud sync.** Sign in with Google and your list follows you between devices through
  Firestore, with offline edits merged when you reconnect.
- **Your data stays portable.** JSON backup export and import, a "Copy for AI" export to ask a
  chatbot about your list, and an "Import from AI" flow to paste a plan back in as tasks.

## Screenshots

|               | Desktop, light                                                                                         | Desktop, dark                                                                                               | Phone, light                                                                                            | Phone, dark                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Tree**      | <img src="docs/screenshots/desktop-light-tree.webp" width="280" alt="Tree view, desktop, light">       | <img src="docs/screenshots/desktop-dark-tree.webp" width="280" alt="Tree view, desktop, dark">              | <img src="docs/screenshots/phone-light-tree.webp" width="130" alt="Tree view, phone, light">            | <img src="docs/screenshots/phone-dark-tree.webp" width="130" alt="Tree view, phone, dark">            |
| **Deadline**  | <img src="docs/screenshots/desktop-light-deadline.webp" width="280" alt="By deadline, desktop, light"> | <img src="docs/screenshots/desktop-dark-deadline.webp" width="280" alt="By deadline, desktop, dark">        | <img src="docs/screenshots/phone-light-deadline.webp" width="130" alt="By deadline, phone, light">      | <img src="docs/screenshots/phone-dark-deadline.webp" width="130" alt="By deadline, phone, dark">      |
| **Today**     | <img src="docs/screenshots/desktop-light-today.webp" width="280" alt="Today view, desktop, light">     | <img src="docs/screenshots/desktop-dark-today.webp" width="280" alt="Today view with capacity meter, dark"> | <img src="docs/screenshots/phone-light-today.webp" width="130" alt="Today view, phone, light">          | <img src="docs/screenshots/phone-dark-today.webp" width="130" alt="Today view, phone, dark">          |
| **Week**      | <img src="docs/screenshots/desktop-light-week.webp" width="280" alt="Week calendar, desktop, light">   | <img src="docs/screenshots/desktop-dark-week.webp" width="280" alt="Week calendar, desktop, dark">          | <img src="docs/screenshots/phone-light-week.webp" width="130" alt="Week as a day list, phone, light">   | <img src="docs/screenshots/phone-dark-week.webp" width="130" alt="Week as a day list, phone, dark">   |
| **Palette**   | <img src="docs/screenshots/desktop-light-palette.webp" width="280" alt="Command palette, light">       | <img src="docs/screenshots/desktop-dark-palette.webp" width="280" alt="Command palette, dark">              | <img src="docs/screenshots/phone-light-palette.webp" width="130" alt="Command palette, phone, light">   | <img src="docs/screenshots/phone-dark-palette.webp" width="130" alt="Command palette, phone, dark">   |
| **Quick add** | <img src="docs/screenshots/desktop-light-quick-add.webp" width="280" alt="Quick-add chips, light">     | <img src="docs/screenshots/desktop-dark-quick-add.webp" width="280" alt="Quick-add chips, dark">            | <img src="docs/screenshots/phone-light-quick-add.webp" width="130" alt="Quick-add chips, phone, light"> | <img src="docs/screenshots/phone-dark-quick-add.webp" width="130" alt="Quick-add chips, phone, dark"> |

<sub>Captured from the real app running against the Firebase emulators, with sample data entered
through the UI.</sub>

## How it's built

| Layer    | Choice                                                                                       |
| -------- | -------------------------------------------------------------------------------------------- |
| UI       | React 18, TypeScript, CSS Modules, framer-motion, dnd-kit for drag and drop                  |
| State    | zustand stores; [`src/store/tasks.ts`](src/store/tasks.ts) is the single source of truth     |
| Logic    | Pure, unit-tested helpers in [`src/lib/`](src/lib) (tree ops, dates, recurrence, quick add…) |
| Sync     | Firebase Auth (Google) + Firestore, through a diff/apply engine in [`src/sync/`](src/sync)   |
| Security | [`firestore.rules`](firestore.rules): owner-only, deny by default, per-field validation      |
| Build    | Vite 7, `vite-plugin-pwa` (Workbox precache), vendor chunks split for long-lived caching     |
| Testing  | Vitest + Testing Library, emulator tests for rules and sync, Playwright end to end           |

```mermaid
flowchart LR
  UI[React components] -- actions --> Store[(zustand store<br/>tasks · history · settings)]
  Store -- render --> UI
  Store -- "debounced diffState(last, next)" --> W[Batched writes]
  W --> FS[(Firestore<br/>users/uid/tasks/id<br/>users/uid/history/id)]
  FS -- onSnapshot --> A["applyRemote(current, last, changes)"]
  A -- hydrate --> Store
  Rules{{firestore.rules}} -.guards.- FS
```

**The store stays the source of truth.** The UI never talks to Firestore. Local changes are
diffed against `last` (the state as last written or applied) and written in batches, debounced
at 250 ms with a 1 s maximum wait. Remote snapshots are decoded and applied on top of the live
store. Each task is its own document, so two devices editing different tasks never collide.

**Signed-out visitors download only what they need.** The app, sync engine and Firestore load as
one lazy chunk after sign-in, and a CI check keeps Firestore off the landing path.

**CI runs three jobs on every pull request** ([`ci.yml`](.github/workflows/ci.yml)): formatting,
lint, unit tests, build, bundle budget and e2e type-check; the Firestore rules and sync tests
against the emulators; and the Playwright suite on desktop and phone viewports against the
emulators.

## Engineering highlights

1. **Reference-equality diffing for sync.** Because the store is copy-on-write with structural
   sharing, [`diffState`](src/sync/diff.ts) finds every changed task by comparing references,
   without deep comparison, and turns it into exactly the Firestore writes needed.
2. **Conflict-aware apply.** [`applyRemote`](src/sync/apply.ts) applies remote changes on top of
   the live state, keeps unflushed local edits, ignores no-op updates to preserve object
   identity, never echoes remote changes back as writes, and repairs a tree left inconsistent by
   concurrent edits. The two-client cases are covered against the real emulator in
   [`tests/emulator/sync.test.ts`](tests/emulator/sync.test.ts).
3. **Security rules that validate the data, with tests.** [`firestore.rules`](firestore.rules)
   denies everything outside `users/{uid}`, and checks field types and ranges (difficulty 1 to
   5, title length, tag count, date formats, repeat shape). The rules are tested in
   [`tests/emulator/rules.test.ts`](tests/emulator/rules.test.ts).
4. **A natural-language parser with clear rules.** [`src/lib/quickAdd.ts`](src/lib/quickAdd.ts)
   handles relative dates (`next fri`, `in 2 weeks`, `this weekend`), month names, ISO and
   locale-aware numeric dates, start dates, repeats, tags and difficulty, and reports each match
   as a positioned token so the composer can show and dismiss it. Its tests sit next to it.
5. **An enforced bundle budget.** [`scripts/check-bundle.mjs`](scripts/check-bundle.mjs) fails CI
   if the signed-out landing path exceeds 160 KB of gzipped JS, if Firestore leaks onto it, or
   if the e2e test hook reaches a production bundle.

The e2e suite ([`e2e/`](e2e)) signs in through the Auth emulator with a test-only hook
([`src/test/e2eHook.ts`](src/test/e2eHook.ts)) that is compiled in only for emulator dev
builds, and covers quick add, subtasks, recurring tasks, rescheduling, Today, Week, undo
cascades, history edits, sharing, multi-device sync and account deletion.

## Built with an AI multi-agent workflow

Part of this project is developed with Claude Code in a fixed, documented process
([`CLAUDE.md`](CLAUDE.md)):

- **One master session** picks GitHub issues labelled `agent:ready`, starts **one child session
  per issue**, and checks and labels the results. It does not write code itself.
- **Each child** works on its own `issue/<n>-<slug>` branch, runs the same checks as CI, and
  opens a PR against the integration branch.
- **[`.agent-log/`](.agent-log)** is the shared memory: one short, committed entry per issue
  and a list of project-wide decisions, so later agents build on earlier ones.
- **Hooks and permissions** in [`.claude/`](.claude) enforce it: a stop hook blocks a child on an
  issue branch from finishing without its log entry, and pushes to `main` and the integration
  branch are denied.

## Getting started

Requires Node 22 (the version CI uses).

```
npm install
npm run dev
```

Vite prints the local URL. Signing in needs a Firebase config (see
[Cloud sync configuration](#cloud-sync-configuration)) or the local emulators.

Other scripts: `npm run build` (type-check and production build), `npm run preview` (serve the
build), `npm run analyze` (build with the bundle visualizer).

### Checks

Run these before every commit. They match the `check` job in CI.

```
npx prettier --check src e2e   # fix with: npm run format
npm run lint
npm test
npm run build
npm run check:bundle
npm run typecheck:e2e
```

`npm run test:watch` runs the unit tests in watch mode.

### Emulator and end-to-end tests

These need Java 21 for the Firebase emulators. They download `firebase-tools` via `npx` on first
run.

```
npm run test:emulators   # Firestore rules and sync tests against the auth + firestore emulators
npm run test:e2e         # Playwright specs, with the emulators started for you
npm run test:e2e:local   # Playwright only; start the emulators yourself first
```

Run these when you touch sync, `firestore.rules` or user flows. The e2e run supplies its own
placeholder Firebase config, so it works without `.env.local`.

### Cloud sync configuration

Sync uses the Firebase web SDK, configured from `VITE_FIREBASE_*` variables that Vite reads at
build time. Copy the template and fill it in:

```
cp .env.example .env.local
```

| Variable                            | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`             | Web API key                                              |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Auth domain                                              |
| `VITE_FIREBASE_PROJECT_ID`          | Firebase project ID                                      |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Storage bucket                                           |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID                                      |
| `VITE_FIREBASE_APP_ID`              | Web app ID                                               |
| `VITE_USE_EMULATORS`                | Set to `1` to use the local auth and Firestore emulators |

The values come from the Firebase console (Project settings, your web app) or from
`firebase apps:sdkconfig WEB <appId>`. They are public by design; access is enforced by
`firestore.rules`. `.env.local` is for your machine only.

To develop against the emulators instead of a real project, set `VITE_USE_EMULATORS=1` in
`.env.local` and start them in another terminal (needs Java 21):

```
npx firebase-tools@15 emulators:start --only auth,firestore
```

The Auth emulator is expected on port 9099 and Firestore on 8080, as set in `firebase.json`.

## Project structure

```
src/
  components/   UI components, each with a *.module.css next to it
  store/        zustand stores (tasks.ts is the core one)
  lib/          pure helpers, with *.test.ts next to them
  sync/         Firestore sync: diff, apply, schema, engine
  landing/      signed-out landing page
  pwa/          service worker registration, install prompt, URL shortcuts
tests/emulator/ Firestore rules and sync tests against the emulators
e2e/            Playwright specs, run against the emulators
scripts/        bundle budget check
firestore.rules security rules
.agent-log/     shared memory for the agent workflow
```

Contributor and agent conventions live in [`CLAUDE.md`](CLAUDE.md).
