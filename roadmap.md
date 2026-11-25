# Bifrost Roadmap

Project-specific backlog for the Bifrost travel planner. Single source of truth — the auto-memory at `~/.claude/projects/.../memory/project_status.md` is a session log, not a roadmap.

Convention (defined in `~/projects/companion/docs/architecture.md`):
- **Top-level** (this file) — Bifrost-specific concerns
- **Personal life** — `~/.claude/personal/roadmap.md` (gitignored, never in repo)

---

## Features — by priority

### P0 — done
- [x] Cultural events radius (commit `5148553`, v=58) — shared `discoveryRadius` drives both Google nearby and Agora events; settings label "Nearby radius" → "Search radius"
- [x] Open day route in Google Maps (commit `5148553`, v=58) — 🗺️ button in Tour section header; majority leg mode picks walking/driving
- [x] Mobile scroll fix (commit `f6da40c`, v=59) — non-passive touchmove moved off `.poi-list` to `document` during active drag; `touch-action: pan-y` on cards
- [x] Firebase rules hardening (uncommitted) — `email_verified === true` guard; added `firebase.json` + `.firebaserc` for CLI deploys

### P1 — "Been" arc (foundational)
- [ ] **"Been" feature** — per-POI `visited` flag + `visitedAt` timestamp; POI card toggle; green map markers + green polyline for traversed legs; global show/hide toggle. *Side effect:* fixes the Oikumene export bug where any *planned* POI exports as `status: 'been'` (see `buildOikumeneExport` app.js:6073, 6104).
- [ ] **Trip check-in button** — one-shot `navigator.geolocation.getCurrentPosition()` on POI card; auto-flips `visited=true` if within ~100m. Manual fallback toggle always available. No background tracking.
- [ ] **Google Timeline JSON import** — post-trip importer for user-exported `Timeline.json` (Phone → Settings → Location → Timeline → Export). Parse `semanticSegments` / `visit` entries, correlate by lat/lng (~100m) and visit-day window, batch-mark matching POIs as visited.
- [ ] **Post-trip export to Oikumene** — after the trip ends (or a "Mark trip complete" action), push visited POIs to Oikumene as historical record. Depends on "Been" landing first.

### P2 — polish
- [ ] **Category icon always visible on cards** — currently shown in `.poi-thumb` only as a *fallback* when there's no image (app.js:2419). Show as small overlay/badge on tour + watchlist cards.
- [ ] **Add to tour from map marker** — Leaflet marker popup gets "Add to today's tour" + "Add to watchlist" buttons for discovered/unimported POIs.
- [ ] **Trip quality analysis includes ratings** — extend metrics (`culturalWeights` etc. around app.js:823) with a "rating" axis = simple average of `poi.rating` (Google) + `poi.myRating`. Add to radar.

### P3 — deferred / needs clarification
- [ ] **Add custom POI** — create a POI from scratch. May already be covered by drop-a-pin — needs clarification.
- [ ] **Import nearby places from Google + Oikumene within trip radius** — for each accommodation, batch-fetch Google nearby + Oikumene bucket/been entries inside `discoveryRadius`, surface as importable POIs in Discover. Requires an Oikumene read endpoint (currently one-way export bridge).

---

## Security backlog (audit 2026-05-30)

10 findings total. Firebase database rules are well-configured (the most important control passed). Gaps are mostly client-side XSS + a config-tracking inconsistency.

### HIGH

- [ ] **[H-2] `esc()` does not escape single quotes — `onclick` injection via imported POI IDs.** `app.js:470-474` (esc definition); ~15 `onclick="App.openDetail('${esc(poi.id)}')"` sites including lines 1496, 2420, 2434, 2800. Imported POI IDs (Google Takeout, KML, CSV, Mapstr) with `'` break out of the attribute. Fix: add `.replace(/'/g, '&#39;')` to `esc()`; or migrate to `data-*` attributes + delegated listeners.
- [ ] **[H-3] User-supplied accommodation `website` URL accepted without scheme validation (open redirect + `javascript:` URI).** `app.js:1567` (accommodation popup), `app.js:2842` (`poi.gmapsUrl`). `javascript:alert(1)` passes through `esc()` unchanged. Fix: add `safeUrl()` allowlist for `https:`/`http:` schemes; apply at all `href` interpolation sites.

### MEDIUM

- [ ] **[M-1] No SRI on any CDN-loaded script or stylesheet.** `index.html:16-21,208,211`. 6 external resources: 3 × Firebase from gstatic, Leaflet from unpkg, lz-string from jsDelivr, Leaflet CSS from unpkg. Fix: generate sha384 hashes (`openssl dgst -sha384 -binary <file> | openssl base64 -A`); add `integrity` + `crossorigin="anonymous"`.
- [ ] **[M-2] No Content Security Policy.** No `<meta http-equiv>` tag, no `_headers` file. Fix: add CSP meta tag with `default-src 'self'`; restrict `script-src` to gstatic/unpkg/jsdelivr; tight `connect-src` for Firebase + map tile endpoints.
- [ ] **[M-3] Client-side `ALLOWED_EMAILS` check is bypassable defense-in-depth (misleading model).** `app.js:79-86`, `config.js:14`. Firebase Rules are the real control (and they're solid). Fix: remove the allowlist from `config.js` entirely or relabel as UX-only with a comment; rely on Firebase Rules.
- [ ] **[M-4] `?share=` URL param applies untrusted state to `State.plan`, `State.accEdits`, etc. without validation.** `app.js:6288-6329` (`checkShareParam`, `loadSharedPlan`). Prototype pollution / session-state corruption risk. Fix: validate structure of decompressed payload before assignment; use `Object.create(null)` or explicit field extraction.
- [ ] **[H-1 → M-5] CLAUDE.md falsely claims `config.js` is gitignored; `allowedEmails` array exposes two real emails to anyone with repo access.** Firebase web client config IS genuinely public-by-design (Firebase SDK requires it), so tracking `config.js` is fine — but: (a) update CLAUDE.md to remove the "gitignored" claim; (b) confirm the GitHub repo is private; (c) decide whether `allowedEmails` belongs in tracked code at all (per M-3 it's already redundant). *Downgraded from HIGH because the original finding misframed the Firebase web config as a secret leak.*

### LOW

- [ ] **[L-1] `bash.exe.stackdump` at repo root.** Gitignored via `*.stackdump`. Harmless (memory addresses only). Fix: `rm bash.exe.stackdump`.
- [ ] **[L-2] `trips/seville-2026.js` contains personal travel PII committed to repo.** Family composition, accommodation locations, restaurant bookings with dates. Fix: confirm GitHub repo is private; consider keeping trip data files in Firebase only for future trips.
- [ ] **[L-3] No `X-Frame-Options` / `frame-ancestors` protection.** GitHub Pages doesn't set headers. Fix: add `frame-ancestors 'none'` to the CSP from M-2; or add a `_headers` file.

---

## Known issues (not roadmap, but to remember)

- **Brave SSO**: `signInWithPopup` triggers COOP warnings. Works in Chromium/Chrome but may fail in Brave depending on shield settings. No good fix without Firebase Hosting.
- **Per-leg routing grouping**: leg-grouping algorithm groups consecutive same-mode waypoints. Edge cases with complex mode sequences may need testing in practice.
- **TypeError at init ~line 5773**: `tripRegistry._arr[0]` can be undefined on second `init()` call. Mitigated with `_initRunning` guard but the root cause (double `onAuthStateChanged` fire) still exists.

---

## Wishlist items intentionally dropped
- "bifrost location" — user said ignore
- "playlist org" — not Bifrost
