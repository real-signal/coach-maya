# e2e

Headless click-through tests against a real Chrome. Not unit tests — these
drive the deployed app the way a user would, and gate on what the user
actually sees.

## Tests

| Script | What it covers |
|---|---|
| `e2e:onboarding` | Full 5-question chat → Claude extraction → schedule → PIN → redirect. 22 assertions. |
| `e2e:dashboard` | Fresh-device boot into Vasco's default dashboard (v54 path). Canvas, nav, gamification widgets, no errors. |
| `e2e:routes` | Loads 14 representative routes, asserts each renders (catches broken lazy-chunk imports). |
| `e2e:draft` | Verifies v63 mid-flow checkpoint: answers 3/5, hard-reloads, confirms chat state restored. |

## Run

```bash
npm run e2e                              # all four, sequentially
npm run e2e:onboarding                   # just one
URL=http://localhost:5173 npm run e2e    # tests local dev
CHROME=/path/to/chrome npm run e2e       # override Chrome auto-detect
```

Requires Google Chrome or Chromium installed (auto-detected on
macOS / Linux / Windows). `puppeteer-core` is used so we don't download a
bundled browser.

## CI

`.github/workflows/e2e.yml` listens for Vercel's `deployment_status: success`
events and fans the four tests out as a matrix — parallel jobs, isolated
failures, individual red ❌ checks on the commit.

Each test exits non-zero on any failure so CI gates cleanly.

## Adding a test

1. Copy an existing `.mjs` file in this directory.
2. Import `{ BASE_URL, launch }` (and optionally `resetStorage`) from `./_helpers.mjs`.
3. Use `check(label, ok, detail?)` for assertions, then `await finish()` at the end.
4. Add `e2e:<name>` to `package.json` scripts.
5. Add `<name>` to the matrix in `.github/workflows/e2e.yml`.
