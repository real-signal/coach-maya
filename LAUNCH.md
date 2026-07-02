# Coach Maya — Launch Runbook

Refreshed 2026-07-01 to reflect actual state. The v83 reframe (2026-06-24) shipped as planned, but the domain/hostname plan pivoted afterward and LAUNCH.md fell behind reality. This version is what's actually true right now.

---

## 1. Where we are (2026-07-01)

- **v83 shipped + pushed** (commit `aaa66ce`, deployed to `coach-maya.vercel.app` — Vasco's project)
- **Vasco e2e: all 4 jobs green** on the last deploy (run 28079676250, 2026-06-24)
- **`coach-maya.vercel.app`: HTTP 200, healthy** as of this check
- **Product surface: still not deployed anywhere real.** The v83 product-mode code (`VITE_PRODUCT_MODE=1`) exists in this repo but no Vercel project of this codebase is running with that flag.
- **Brand pivoted `mayaprep` → `askmaya` on 2026-06-27**, but the execution is inconsistent (see §2).

Launch blocker is still operational (get this codebase deployed at the product hostname), not technical.

---

## 2. The `askmaya` / `mayaprep` / `coach-maya` situation

Three "Maya" things share airspace right now — only one is actually this repo:

| Name | What it is | Status | Owner |
|---|---|---|---|
| `coach-maya` Vercel project → `coach-maya.vercel.app` | **This repo**, Vasco's private-facing deploy | ✅ live, healthy | Vasco |
| `askmaya` Vercel project → `askmaya.vercel.app` | A **different** Next.js codebase ("Astrology assistant"), currently serving `/maintenance` | ⚠️ live but unrelated to this repo | Vasco (same Vercel scope, `prj_jTBLID7Bit0cmVZzYALaLfErMG9x`, created 2026-06-27) |
| `mayaprep.com` | **Third-party company** — "Maya Prep" SAT/ACT tutoring, WordPress + WooCommerce, `America/Detroit` timezone | ❌ not ours | Someone else. LAUNCH.md v1's claim that it was parked at Hostinger under Vasco was wrong. |

### GH repo variable
- `PRODUCT_URL_DOMAIN=askmaya` (set 2026-06-27, 08:52 UTC)
- Effect: `product-e2e` job in `.github/workflows/e2e.yml:47-51` fires only on deploys whose URL contains `askmaya` — i.e. **never on this repo's deploys** (which contain `coach-maya`), and it fires *only* on that other astrology project's deploys. So the product-mode e2e tests (`e2e/product-landing.mjs`, `e2e/product-signup.mjs`) are effectively dormant.

### The three questions before any further plumbing

Answer these first — everything downstream depends on them:

1. **Is `askmaya` still the intended brand for the Coach Maya product?** If yes, either (a) the Vercel `askmaya` project needs to be re-pointed at *this* repo, replacing the astrology app, or (b) a fresh Vercel project with a different name is needed and `PRODUCT_URL_DOMAIN` gets re-set.
2. **What's the domain plan now that `mayaprep.com` is confirmed not-yours?** Options: buy `askmaya.com` (currently resolves — check ownership), stick with `askmaya.vercel.app`, or pick a third name.
3. **What happens to the existing `askmaya` Next.js astrology app?** Kept separate on a different project? Merged? Shelved?

Nothing else in this runbook is actionable until (1) is decided.

---

## 3. The v83 reframe (mother-to-parent positioning) — unchanged, still true

**Old positioning:** "AI coach that drills AMC problems for kids"
**New positioning:** "The personal assistant for your child — built by a mother who needed one"

### Files changed in v83 (all `VITE_PRODUCT_MODE`-gated, Vasco's deploy untouched)

| File | Change |
|---|---|
| `src/features/maya/ProductLanding.jsx` | Hero: "I built Maya for my son. Now she's yours." Founder story is the spine. Whole-child surface tiles. Parent-fear value props. |
| `src/features/maya/Onboarding.jsx` | Maya addresses the parent about their kid. 6 parent-voice questions. Name extraction handles "her name is X" / "his name is X". `finishSetup` redirects to `/report`. |
| `src/features/maya/MayaProductHome.jsx` | "Parent view →" link top-right. Whole-child surface tiles below the drill. |
| `src/features/maya/MayaParentReport.jsx` | System prompt rewritten parent-to-parent. "Hand the device to [Kid] →" is the Day-1 primary CTA. |
| `src/features/maya/agents/profileBuilder.js` | Keyword fallback extracts names from parent voice. |
| `src/App.jsx` | `PRODUCT_ALLOWED_POST_SETUP` expanded from 7 → 14 routes. |
| `e2e/product-landing.mjs` + `e2e/product-signup.mjs` | Fixtures updated for new copy + parent-voice flow + `/report` redirect verification. |

### The parent's Day-1 flow (post-v83, once a product host exists)

1. Lands on the product URL → sees "I built Maya for my son. Now she's yours."
2. Taps "Set Maya up for your kid" → chat onboarding (6 questions, parent-voice, 5 min)
3. Sets 4-digit PIN
4. Lands on Maya's Day-1 note (parent-to-parent voice)
5. Taps "Hand the device to [Kid] →"
6. Parent returns via "Parent view" top-right, screenshots the weekly note

---

## 4. Vercel setup runbook (updated)

### Pre-flight constraints

- **Project name must NOT contain `coach-maya`** — the `e2e.yml:14` matcher fires on any URL with that substring.
- **Don't touch the existing `.vercel/` link** in the main working tree. `.vercel/project.json` in `/Users/vasco/coach-maya` is bound to `coach-maya` (`prj_7NVsm7fPykoIXjudS1il65SFrnXZ`). Use a separate git worktree for product project setup.
- **`vercel` CLI is installed** and authenticated as `saraspalian-cpu`. Only team available is `saraspalian-cpus-projects` (no `real-signal` scope). All projects live in the personal scope.
- **GH CLI authenticated** as `saraspalian-cpu` on `real-signal/coach-maya`.
- **Stale worktree exists** at `/private/tmp/maya-product-setup` (marked prunable). Run `git worktree prune` before creating a fresh one.

### Two paths depending on Q1 in §2

#### Path A — Reuse the `askmaya` Vercel project (replace the astrology app)

```bash
git worktree prune
git worktree add /tmp/maya-product-setup main
cd /tmp/maya-product-setup

# Link to the existing askmaya project (does NOT touch ./vercel in main tree)
vercel link --project askmaya --yes

# Confirm what's currently there (framework preset is 'Other', install=yarn — needs fixing)
vercel project inspect askmaya

# Set env vars
echo "1" | vercel env add VITE_PRODUCT_MODE production
vercel env add ANTHROPIC_API_KEY production   # paste key when prompted

# Point at this repo (browser flow)
vercel git connect

# Kick a deploy
cd /Users/vasco/coach-maya
git commit --allow-empty -m "v84: retarget askmaya at coach-maya repo"
git push
```

**Warning:** doing this will kill the astrology-app deploys under `askmaya.vercel.app`. If that project has meaningful history/env, back it up first (`vercel env pull` in a separate worktree linked to it).

#### Path B — Fresh Vercel project under a new name

```bash
git worktree prune
git worktree add /tmp/maya-product-setup main
cd /tmp/maya-product-setup

vercel link --project <new-name> --yes   # e.g. maya-parent, mayacoach — NOT containing "coach-maya"

echo "1" | vercel env add VITE_PRODUCT_MODE production
vercel env add ANTHROPIC_API_KEY production

vercel git connect

# Update the GH matcher
gh variable set PRODUCT_URL_DOMAIN --body "<new-name>" --repo real-signal/coach-maya

cd /Users/vasco/coach-maya
git commit --allow-empty -m "v84: trigger <new-name> deploy"
git push
```

### Environment variables (both paths)

| Name | Value | Type | Why |
|---|---|---|---|
| `VITE_PRODUCT_MODE` | `1` | Plain | Inlined by Vite at build time, flips bundle to product mode |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | **Secret** | Used by `/api/anthropic` proxy. NEVER prefix with `VITE_` |

Set Production / Preview / Development to same values.

### Verification after first deploy

```bash
# Bundle must not leak the API key
# (Note: the substring "sk-ant" appears in the bundle as a placeholder in the settings input — that's fine.
# What you want to confirm is that no real key with body chars follows it.)
curl -s https://<product-host>/assets/index-*.js | grep -oE "sk-ant-[a-zA-Z0-9_-]{20,}"   # MUST be empty

# Landing renders the reframe
curl -s https://<product-host> | grep -o "NOW SHE'S YOURS"                                 # MUST match

# Maya's note actually calls Claude (browser check — complete onboarding, verify 3+ sentences of specific copy)
```

### Rollback

- **Product deploy breaks:** Vercel dashboard → project → Deployments → promote earlier green deploy. Vasco's `coach-maya` project is a separate project, untouched.
- **Vasco's deploy breaks:** same drill in the `coach-maya` project.
- **DNS goes sideways:** the `*.vercel.app` URL keeps working regardless of custom-domain state.

---

## 5. Domain plan — deferred (decision 2026-07-01)

**Decision:** ship the first-5 test on a `<project>.vercel.app` URL. No domain purchase. Custom domain gets picked up again after the first-5 signal.

Why: the v83 build is ready, the first-5 test only needs a working URL, and buying a domain is a distraction that adds days without adding signal. The DM will send a `.vercel.app` link — the v1 rule against that is relaxed for the first-5 window only.

Dead / do-not-do:
- `mayaprep.com` is not yours (live WordPress + WooCommerce store for a Detroit SAT/ACT tutoring company). Do not attempt DNS on it.
- Hostinger nameserver swap from v1: void.
- Buying `askmaya.*`: all three top TLDs (`.com`/`.ai`/`.app`) resolve to someone else — don't chase.

### To reconsider domain (post first-5)

Signals that make a domain worth buying:
- 3+ of the 5 parents came back Day 2 (real product signal)
- A parent independently asked "do you have a real URL"
- You're about to widen beyond 5

Until then: `<project>.vercel.app` is the URL.

---

## 6. Parent outreach DM (first 5 only)

Copy is unchanged. The only rule adjustment: the "never send a `vercel.app` URL to a real human" rule from v1 is **relaxed for the first-5 window** (see §5). Send `<project>.vercel.app` as the link.

Still don't send until §2 (which Vercel project) is resolved and that project actually renders v83.

### Pre-send checklist

1. The product URL works end-to-end (setup completes, Maya's note renders, hand-off CTA works)
2. You can name the kid (if you have to guess, pick a different parent)
3. You have an hour today to respond when they reply

### The core DM

> Hey [name] — quick one.
>
> You know how I'm always rambling about how I track everything for Vasco — his mood before piano, when to push tennis, the math drill thing.
>
> I finally built it. Maya. It's a personal coach for the kid that holds the whole picture — math, music, sport, the lot — and sends me a weekly note about him that I actually screenshot.
>
> I'm picking 5 parents to be the first real test before it goes anywhere wider. [Kid's name] came to mind. Would you give it 5 min this week and tell me honestly what you think? Setup is one chat, no card.
>
> Total no-pressure if it's not your season for this. Just wanted to ask you first.

### When they say yes

> Amazing. Two things:
>
> 1. Link: <product URL> — open it on your phone, takes 5 min
> 2. When you finish setup, you'll land on a "Maya's Note" page — screenshot that and send it back to me. That's the artifact I most want feedback on.
>
> One ask: be brutal. If it feels off, tell me exactly where. I'd rather hear it from you than from a stranger.

### When they go quiet for 4 days

> No pressure at all — just wanted to check in. Did you get a chance to look at Maya? Even a "tried it and bounced because X" is useful to me. I'm trying to figure out what's actually broken vs what I'm imagining.

### Do NOT say

- ❌ "AI-powered" / "ML-driven"
- ❌ "Beta" / "early access"
- ❌ Stats about the model, the agents, the architecture
- ❌ "Could you also share it with…" on the first send
- ❌ Anything that acknowledges the URL is a `.vercel.app` ("it's just a preview", "still setting up the real site"). If asked directly, "yeah I'm keeping it simple until I know what works." Do not apologize for the URL.

### Operational rules

- One at a time, spaced 2–3 days
- If parent #1 finds a bug Monday, fix it before #4 and #5 hit
- The only metric that matters: **did their kid come back the next day?**

---

## 7. What you're listening for — unchanged

1. **Where in 5-min setup did they hesitate?** → Onboarding friction (fixable)
2. **Did they screenshot Maya's note?** → If no, viral artifact isn't artifactual yet
3. **Did they hand the device to their kid?** → If no, parent→kid handoff is broken
4. **Did their kid come back the next day?** → Only metric that matters

Calibration: 3-of-5 hit #4 → product. 1-of-5 → positioning problem. 0-of-5 → `MayaProductHome.jsx` is the next rebuild target.

---

## 8. What's NOT in scope yet (deliberate)

- **PRODUCT_MODE-aware copy inside `/tennis`, `/piano`, `/reading`, `/homework`, `/moods`, `/sleep`** — still kid-voice
- **Per-user API quota** — `/api/anthropic` has 30 req/min per-instance rate limit (v80), no monthly cap yet. Set a soft cap at Anthropic dashboard before public URL
- **Supabase auth / paywall** — inert; free tier is the wedge
- **Bottom nav allowlist sync** — `BottomNav` not audited against the 14-route allowlist

---

## 9. Known yellow flags (from health check 2026-07-01)

- `npm audit`: 2 moderate — `react-router` 6.7.0–6.30.3 open-redirect (GHSA-2j2x-hqr9-3h42). `npm audit fix` clears it.
- `three-*.js` chunk still 1.09 MB / 304 kB gzip. Lazy per v76 memory — the build warning is expected, not a regression.
- Stale worktree at `/private/tmp/maya-product-setup`. Run `git worktree prune`.

---

## 10. Decisions log + remaining open items

### Resolved 2026-07-01
- **Q3 (custom domain):** Deferred. Ship on `<project>.vercel.app`. Reconsider only after first-5 signal (§5).
- **DM URL rule:** relaxed for first-5 (§6).

### Still open — must resolve before deploy
1. **Project name for the product Vercel project.** This IS the URL parents see (`<name>.vercel.app`). Options:
   - **Reuse `askmaya`** — free (already created 2026-06-27), but requires resolving Q2 (below) and collides in your head with the astrology app of the same name. Not ideal for a parent-facing brand you'll say out loud.
   - **New name** — clean; costs one `vercel link` + updating `PRODUCT_URL_DOMAIN`. Needs to be a name you'd be comfortable saying to a parent on WhatsApp. Cannot contain `coach-maya` (breaks `e2e.yml:14` matcher).
2. **Astrology `askmaya` Next.js app fate.** Only relevant if reusing the `askmaya` Vercel project. Options: back up env/repo pointer and let deploys die, migrate it to a new project first, or pick a new name for Coach Maya and leave askmaya alone.
3. **Post-project-creation plumbing** (mechanical, once #1/#2 are decided):
   - Set `VITE_PRODUCT_MODE=1` + `ANTHROPIC_API_KEY` in that project
   - Set `PRODUCT_URL_DOMAIN` GH variable to match the project-name substring
   - Push an empty commit to trigger deploy
   - Verify per §4 verification steps
   - Update the DM template with the chosen `<project>.vercel.app` URL

---

## 11. Memory anchors

Persistent context: `/Users/vasco/.claude/projects/-Users-vasco-coach-maya/memory/MEMORY.md`. Key facts already indexed:

- Vasco Connor profile (14, Singapore, Mensa, olympiad/piano/tennis stats)
- VITE_PRODUCT_MODE split (v71)
- E2E deploy verification flow
- "Test the deployed artifact, not the local build" (CSP/header/CDN bugs hide in vite build)
- Founder strategy session 2026-06-16 (wedge baked, brand/domain was last blocker — and still is, per this refresh)
- Vite modulepreload defeats lazy() (v76)

The 2026-06-27 domain pivot + the `mayaprep.com` misidentification + the 2026-07-01 decision to ship on `.vercel.app` (no domain until first-5 signal) are worth adding as a project memory once a project name is picked.
