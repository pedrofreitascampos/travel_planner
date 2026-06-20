# Bifrost — Travel Planner

## Stack
Vanilla JS + Firebase (backend/auth) + Leaflet (maps). Single `app.js` file.

## Run
- Open `index.html` in browser (or local server)
- Deployed on GitHub Pages

## Key Conventions
- No build step, no bundler — plain JS
- Firebase for data persistence and auth
- Config in `config.js` (tracked — Firebase web client config is public-by-design; security enforced by Firebase Rules). Template: `config.example.js`. **Do not put server-side secrets here.**

## Roadmap
Single source of truth: `roadmap.md` at repo root. Read it before suggesting next work.

## Deploying Firebase Database Rules
Rules live in `database.rules.json`. To push changes to the live RTDB:

```
firebase deploy --only database
```

(`firebase.json` + `.firebaserc` pin the deploy to project `tripcraft-e0389`. Requires `firebase login` once per machine.)
