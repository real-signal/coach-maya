# Coach Maya — Supabase setup

Supabase is **optional**. The app runs fully offline against `localStorage` when no env vars are set (Vasco's personal deploy). The product build (`VITE_PRODUCT_MODE=1`) needs it for multi-tenant auth + cross-device sync.

## Env vars (set in Vercel project settings)

| Var | Where it's used |
|---|---|
| `VITE_SUPABASE_URL` | Browser bundle — public, fine to ship |
| `VITE_SUPABASE_ANON_KEY` | Browser bundle — public anon key, RLS-protected |

When both are present, `src/lib/supabase.js` returns a real client. When either is missing, `getSupabase()` returns `null` and every cloud path in `auth.js` / `storage.js` no-ops cleanly.

## Apply the schema

Pick one:

**A) Supabase dashboard SQL editor**
1. Open your project → SQL Editor → New Query.
2. Paste the contents of `schema.sql` and run.

**B) Supabase CLI**
```bash
supabase db push --file supabase/schema.sql
```

## What the schema does

| Table | Purpose |
|---|---|
| `parents` | one row per `auth.users` parent account |
| `children` | each parent's kids |
| `profiles` | per-child profile JSON (mirror of `maya_profile` localStorage key) |
| `schedules` | per-child schedule JSON (mirror of `maya_schedule`) |
| `daily_state` | per-child, per-day state snapshot |
| `data_store` | generic per-child key/value for the rest of `MAYA_KEYS` (memory, lessons, vocab, habits, etc.) |
| `push_subscriptions` | web-push endpoints |

Every table has RLS enabled. Policies restrict access to rows where the row's parent (directly or via `child_id → parent_id`) matches `auth.uid()`. A leaked anon key cannot read another parent's data.

## Auth UX

Currently scaffolded for email + password via `src/lib/auth.js` (`signUp` / `logIn` / `logOut`). Magic-link or OAuth would just swap the call in `signUp`/`logIn`; everything downstream is session-based.
