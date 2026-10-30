# Tasks

A mobile-friendly PWA for nested tasks. Each task can have subtasks, a difficulty, tags, a
deadline, notes and a hide-until date, and the app keeps a history of what you finished. There is
an opt-in Today view with a daily capacity. Data is stored locally and can optionally sync across
devices through Firebase (Google sign-in plus Firestore).

Built with React 18, TypeScript, Vite and zustand.

## Run it locally

Requires Node 22 (the version CI uses).

```
npm install
npm run dev
```

Vite prints the local URL. Cloud sync needs Firebase config; see below.

Other scripts: `npm run build` (type-check and production build), `npm run preview` (serve the
build), `npm run analyze` (build with the bundle visualizer).

## Checks

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

## Cloud sync configuration

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

## Project layout

- `src/components/` UI components, each with a `*.module.css` next to it
- `src/store/` zustand stores (`tasks.ts` is the core one)
- `src/lib/` pure helpers, with unit tests next to them
- `src/sync/` Firestore sync (diff, apply, schema)
- `e2e/` Playwright specs
- `firestore.rules` security rules

Contributor and agent conventions live in `CLAUDE.md`.
