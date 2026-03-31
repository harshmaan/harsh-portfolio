# ⚡ Performance Optimization Changelog

> Context hub for the ongoing performance & speed improvements to [harshmaan.com](https://harshmaan.com).  
> Session started: **31 March 2026** · Branch: `master` · Commit: `83268e1`

---

## 🔍 Initial Audit Summary

A full performance audit was conducted across the entire website with a focus on the **"Spy Within Us"** multiplayer game. **13 issues** were identified across categories: bundle size, asset optimization, runtime performance, code correctness, and caching.

---

## ✅ Changes Implemented

### 1. Massive unoptimized images (~34 MB in `/public`)
- **Status:** 🟡 Identified — not yet converted
- **Issue:** Synapse PNGs alone are **16.3 MB** (up to 4.5 MB each). `og-image.png` is 2.3 MB, `passion-pursuit.png` is 2.4 MB. JPGs are 1.3–2.1 MB each.
- **Planned fix:** Convert to WebP/AVIF, resize to max display dimensions, use Astro's `<Image>` component.
- **Files:** `public/*.png`, `public/*.jpg`

---

### 2. `world.json` (434 KB) loaded eagerly by Globe
- **Status:** ✅ Fixed
- **Issue:** GeoJSON was statically imported into `Globe.tsx`, shipping in the main JS bundle on every homepage visit.
- **Fix applied:**
  - Changed to dynamic `import()` inside `onMount` so the file is fetched on demand.
  - Added `onCleanup()` to stop the D3 timer when the component unmounts.
- **File:** `src/components/Globe.tsx`

---

### 3. Full Firebase SDK loaded client-side in Spy game
- **Status:** ✅ Fixed
- **Issue:** `firebase` v10 core + Realtime Database SDK loaded immediately via `client:load`.
- **Fix applied:**
  - Created a lazy `getFirebase()` helper that only imports Firebase when the user clicks "Enter Game".
  - All Firebase operations (`set`, `ref`, `onValue`, `get`, `remove`) now go through the lazy-loaded module.
  - Changed `client:load` → `client:idle` on the `<JoinSpyGame>` component.
- **File:** `src/components/JoinSpyGame.tsx`, `src/pages/spy/join.astro`

---

### 4. D3 fully imported (`import * as d3`)
- **Status:** ✅ Fixed
- **Issue:** Entire D3 library (~250 KB minified) bundled for a simple orthographic globe.
- **Fix applied:**
  - Replaced `import * as d3` with targeted imports: `d3-geo`, `d3-selection`, `d3-timer`.
  - Added `d3-geo`, `d3-selection`, `d3-timer` as explicit dependencies in `package.json`.
- **Files:** `src/components/Globe.tsx`, `package.json`

---

### 5. `chat.js` and `voicechat.js` loaded on every page
- **Status:** ✅ Fixed
- **Issue:** `BasicLayout.astro` unconditionally included both scripts in `<head>` — loaded on Spy game, Synapse pages, blog posts, etc.
- **Fix applied:**
  - Added `enableChat?: boolean` prop to `BasicLayout.astro` (defaults to `false`).
  - Scripts and chat/voice modal HTML are now conditionally rendered only when `enableChat={true}`.
  - `Layout.astro` (homepage wrapper) passes `enableChat={true}`.
  - All other pages (spy, synapse, travel, blog, etc.) no longer load these scripts.
- **Files:** `src/layouts/BasicLayout.astro`, `src/layouts/Layout.astro`

---

### 6. Duplicate `voice.js` file
- **Status:** ✅ Fixed
- **Issue:** `public/voice.js` was an older duplicate of `public/voicechat.js`.
- **Fix applied:** Deleted `public/voice.js`.
- **File:** `public/voice.js` (deleted)

---

### 7. No cleanup of Firebase listeners in Spy game
- **Status:** ✅ Fixed
- **Issue:** `JoinSpyGame.tsx` set up **13+ `onValue` listeners** in `handleJoin()` but never called `off()` or stored unsubscribe functions.
- **Fix applied:**
  - Created an `unsubscribers[]` array to track every `onValue` return value via a `track()` helper.
  - Added `onCleanup()` (SolidJS lifecycle) to call all unsubscribe functions when the component unmounts.
- **File:** `src/components/JoinSpyGame.tsx`

---

### 8. Vote tally race condition (all players execute simultaneously)
- **Status:** ✅ Fixed
- **Issue:** `tallyVotesAndEliminate()` was triggered by a `createEffect` on every client — all players who received the vote update simultaneously could fire it, causing duplicate Firebase writes.
- **Fix applied:** Added `if (!isHost()) return;` guard at the top of `tallyVotesAndEliminate()` so only the host executes the tally.
- **File:** `src/components/JoinSpyGame.tsx`

---

### 9. Homepage loader animation blocks rendering on repeat visits
- **Status:** ✅ Fixed
- **Issue:** Full-screen `.loader` overlay played every single visit.
- **Fix applied:**
  - Added `sessionStorage.getItem("hasVisited")` check in the homepage `<script>`.
  - On repeat visits within the same session, the loader is hidden instantly and cards are shown with `opacity: 1`.
  - First visit still plays the full stagger animation.
- **File:** `src/pages/index.astro`

---

### 10. No caching headers configured on Netlify
- **Status:** ✅ Fixed
- **Issue:** `netlify.toml` only had a single User-Agent header for `/api/reddit`.
- **Fix applied:** Added `Cache-Control` headers for:
  - Fonts (`/fonts/*`, `*.woff2`, `*.ttf`): `max-age=31536000, immutable`
  - Images (`*.png`, `*.jpg`, `*.webp`): `max-age=2592000` (30 days)
  - JS/CSS (`*.js`, `*.css`): `max-age=604800` (7 days)
  - Favicon: `max-age=31536000, immutable`
- **File:** `netlify.toml`

---

### 11. Font files served as raw TTF
- **Status:** 🟡 Identified — WOFF2 conversion pending
- **Issue:** `CabinetGrotesk-Variable.ttf` and `Satoshi-Variable.ttf` are served as TTF. WOFF2 would be ~30–50% smaller.
- **Planned fix:** Convert to WOFF2 format, update `@font-face` `src` in `BasicLayout.astro`, add `<link rel="preload">` for critical fonts.
- **Files:** `public/fonts/`, `src/layouts/BasicLayout.astro`

---

### 12. Spy game index page has broken Astro syntax
- **Status:** ✅ Fixed
- **Issue:** `/spy/index.astro` used `on:submit` (Svelte/SolidJS syntax) which is invalid in Astro templates.
- **Fix applied:**
  - Removed inline `on:submit` handler from the `<form>`.
  - Added `id="spy-join-form"` to the form.
  - Moved logic into a proper Astro `<script>` tag using `addEventListener` + `FormData`.
- **File:** `src/pages/spy/index.astro`

---

### 13. CSS `body::before` grid animation runs continuously
- **Status:** ✅ Fixed
- **Issue:** `whiteGridGlow` keyframe animation runs infinitely on every page, causing constant GPU compositing.
- **Fix applied:** Added `@media (prefers-reduced-motion: reduce)` block that disables both the grid glow animation and the loader animation.
- **File:** `src/layouts/BasicLayout.astro`

---

## 🎯 Fix #14 — Spy Game Click-to-Render Delay

**Problem:** Every click in the Spy game had a noticeable delay before the UI updated, because:
1. Every action (`handleVote`, `handleSubmitResponse`, etc.) called `await getFirebase()` — an async import — before doing anything.
2. UI state was only updated **after** the network round-trip to Firebase completed.
3. Host functions like `tallyVotesAndEliminate` used sequential `await` calls that could be parallelized.

**Fix applied:**
- **Cached Firebase loader:** `getFirebase()` now caches its promise so the dynamic `import()` only runs once. Added a synchronous `fb()` accessor for post-join usage (Firebase is guaranteed loaded after joining).
- **Optimistic UI:** Player actions now update local state **before** the network call:
  - `handleSubmitResponse` → `setHasSubmitted(true)` before `await set(…)`
  - `handleSendMessage` → `setChatInput("")` before `set(…)`
  - `handleVote` → fire-and-forget (no `await`)
- **Parallelized Firebase reads:** `generatePrompt()` now fetches the API prompt + 3 Firebase snapshots (`roles`, `players`, `dead`) in a single `Promise.all`.
- **Parallelized writes:** `startNextRound()`, `tallyVotesAndEliminate()` batch independent `set()`/`remove()` calls into `Promise.all`.
- **Reverted `client:idle` → `client:load`** on `spy/join.astro` — the game page needs immediate hydration to avoid input delay.

**Files modified:**
- `src/components/JoinSpyGame.tsx`
- `src/pages/spy/join.astro`

---

## 📋 Remaining TODO

| # | Task | Impact | Status |
|---|------|--------|--------|
| 1 | Convert images to WebP/AVIF + resize | ~30 MB bandwidth saved | 🟡 Pending |
| 11 | Convert TTF fonts to WOFF2 + add preload | ~30% font size reduction | 🟡 Pending |

---

## 📁 Files Modified (Commit `83268e1`)

| File | Change |
|------|--------|
| `netlify.toml` | Added cache headers for static assets |
| `package.json` | Added `d3-geo`, `d3-selection`, `d3-timer` deps |
| `public/voice.js` | **Deleted** (duplicate) |
| `src/components/Globe.tsx` | Tree-shaken D3, dynamic world.json import, cleanup |
| `src/components/JoinSpyGame.tsx` | Lazy Firebase, listener cleanup, host-only tally |
| `src/layouts/BasicLayout.astro` | Conditional chat scripts/modals, reduced-motion |
| `src/layouts/Layout.astro` | Pass `enableChat={true}` |
| `src/pages/index.astro` | Skip loader on repeat visits, Globe `client:idle` |
| `src/pages/spy/index.astro` | Fix broken `on:submit` → vanilla JS `<script>` |
| `src/pages/spy/join.astro` | `client:idle` → `client:load` (reverted, game needs immediate hydration) |
| `src/pages/travel.astro` | Globe `client:load` → `client:visible` |

## 📁 Files Modified (Fix #14 — Click Delay)

| File | Change |
|------|--------|
| `src/components/JoinSpyGame.tsx` | Cached Firebase loader, sync `fb()` accessor, optimistic UI, parallelized reads/writes |
| `src/pages/spy/join.astro` | Reverted to `client:load` for instant hydration |
