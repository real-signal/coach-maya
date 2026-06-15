# e2e

Headless click-through tests against a real Chrome. Not unit tests — these drive
the deployed app the way a user would, and gate on what the user actually sees.

## Run

```bash
npm run e2e                              # tests https://coachmaya.vercel.app
URL=http://localhost:5173 npm run e2e    # tests a local dev server
CHROME=/path/to/chrome npm run e2e       # override Chrome auto-detect
```

Requires Google Chrome or Chromium installed (auto-detected on
macOS / Linux / Windows). `puppeteer-core` is used so we don't download a
bundled browser.

## What's covered

- **`onboarding.mjs`** — full conversational onboarding: 5 chat questions,
  Claude profile extraction, schedule generation, mid-flow draft checkpoint,
  PIN setup, redirect, persistence. Also asserts zero console errors and zero
  failed requests. This is the test that caught the v64 CSP bugs.

Each test exits non-zero on any failure so CI can gate on `npm run e2e`.
