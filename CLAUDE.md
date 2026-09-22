# University Hills / Pre-K Lunch Planner

A kid-friendly dashboard so the user's son can see what's for lunch and plan his day. Two schools, two tabs, one shared calendar.

- **Local app + editor:** double-click `Start Lunch App.command` → opens `http://127.0.0.1:8743/` in the browser. Keep that Terminal window open while using it; closing it stops the server.
- **Hosted read-only copy** (for viewing on other devices, e.g. an iPad): https://worn-compass.github.io/uhills_lunch/
- **GitHub repo:** https://github.com/worn-compass/uhills_lunch (public — see "Why public" below)

## The one thing to remember

**"Refresh & Publish"** (top-right button, only visible when running locally) does the whole update cycle in one click: re-scrapes both schools' menus/photos from Nutrislice, reloads the local app, then commits + pushes to GitHub, which redeploys the hosted copy within about a minute. If nothing changed since last time, it says so instead of creating an empty commit.

## Architecture

```
scraper/scrape_menu.py   stdlib-only Python scraper (no pip installs needed)
server.py                stdlib-only local HTTP server (no pip installs needed)
Start Lunch App.command  double-clickable launcher -> `python3 server.py`
docs/                    the site itself -- doubles as the local server root
                          AND the GitHub Pages source (Settings > Pages >
                          Deploy from branch `main`, folder `/docs`)
  index.html, app.js, style.css   the frontend
  data/uhills.json               U Hills menu data
  data/prek.json                 Pre-K menu data
  data/images/<food_id>.<ext>    downloaded food photos, shared across schools
```

Because `docs/` is served two different ways (bare origin locally, a
`/uhills_lunch/` subpath on GitHub Pages), **all fetch/image paths in
app.js are relative** (`data/uhills.json`, not `/data/uhills.json`). Don't
reintroduce a leading slash there or the hosted copy breaks.

## Data source: Nutrislice

Both schools are on Rochester Community Schools' Nutrislice site. The
*public-facing* site (`rochesterk12.nutrislice.com`) only serves the HTML
shell — the real data comes from a separate JSON API subdomain that needs
no auth:

```
https://rochesterk12.api.nutrislice.com/menu/api/weeks/school/<school-slug>/menu-type/<menu-type>/<year>/<month>/<day>/
```

- The queried date is treated as the **last day (Saturday)** of the
  returned week. The scraper steps through Saturdays to get full,
  non-overlapping coverage — don't query arbitrary dates expecting that
  date to be the first day back.
- School slugs: `university-hills` (menu-type `lunch` only) and
  `caring-steps` (menu-types `breakfast`, `lunch`, `snack`).
- The scraper pulls a rolling window: 30 days back, 180 days forward from
  "today" at scrape time. Re-running it later naturally picks up newly
  published months with no code changes.
- Food photos live at predictable `client-food-images.nutrislice.com`
  URLs inside each food object's `image_url`. The scraper downloads them
  once into `docs/data/images/<food_id>.<ext>` and skips re-downloading
  files that already exist, so repeat refreshes are fast.

## Data model

**U Hills** (`docs/data/uhills.json`) — kids pick exactly one meal path,
plus sides:
```json
{ "days": { "<date>": {
  "meal_paths": [ { "section": "Lunch", "items": [food, ...] }, ... ],
  "sides_for_all": [food, ...],
  "fruit_veg_bar": [food, ...],
  "milks": [food, ...],
  "condiments": [food, ...]
}}}
```
`meal_paths` sections come from Nutrislice section headers: Lunch, On the
Go, Alternate Entrees, Veg Out. `milks`/`condiments` are split out of the
"Milk & Condiments" section by `food_category == "beverage"`.

**Pre-K** (`docs/data/prek.json`) — no choices, just what's served:
```json
{ "days": { "<date>": {
  "breakfast": [food, ...], "lunch": [food, ...], "snack": [food, ...]
}}}
```
Only meal types that actually have data that day are present (e.g. some
early days have breakfast only).

A `food` item always looks like:
```json
{ "id": 123, "name": "...", "description": "...", "category": "entree",
  "image": "images/123.png" | null, "allergens": ["Milk", "Wheat"] }
```

## Frontend behavior (docs/app.js)

- Two tabs, "U Hills" and "Pre-K" (`TABS` config, `state.activeTab`).
- **Day navigation is shared** across both tabs: `state.dates` is the
  *union* of dates either school has data for, with one `state.dayIndex`.
  Switching tabs never changes the selected date. If the active tab has
  no menu on that date (e.g. a day only Pre-K has data for), it shows a
  small "No menu for this day" state rather than stale data.
- Each tab keeps its **own selection state** (what's tapped/picked),
  independent of the other tab, reset whenever the date changes.
- U Hills uses a single-select "pick one path" card grid, then multi-select
  grids for fruit/veg and condiments, single-select for milk, all summarized
  in a bottom "My Lunch Plan" tray.
- Pre-K uses tap-to-check multi-select grids per meal (nothing is mutually
  exclusive, since nothing is actually a choice) summarized in a "Today at
  Pre-K" tray.
- Both trays are `position: fixed` bottom bars (not `sticky` — sticky was
  tried first and visually overlapped later sections because the tray's
  container is much taller than the viewport; fixed + `padding-bottom` on
  `main` is the fix that's in place now).
- The Refresh & Publish button is hidden unless `location.hostname` is
  `127.0.0.1`/`localhost`, since the hosted GitHub Pages copy has no
  server behind it to handle those requests.
- `style.css` and `app.js` are loaded via `document.write()` with a
  `?v=Date.now()` cache-buster in `docs/index.html`, instead of plain
  `<link>`/`<script src>` tags. GitHub Pages has no way to set custom
  cache headers, and mobile Safari in particular can hang onto stale
  copies of these for a long time (edits only showing up in a private
  tab was the symptom). Don't revert to static tags — menu JSON already
  cache-busts itself the same way via `loadTab()`'s `?t=Date.now()`.

## Local server (server.py)

Stdlib `ThreadingHTTPServer`, no dependencies. Serves everything under
`docs/` as static files, plus two POST endpoints used by the Refresh &
Publish button:

- `POST /api/refresh` — runs `scraper/scrape_menu.py` as a subprocess.
- `POST /api/publish` — `git add -A`, then commits and pushes only if
  `git status --porcelain` shows something staged (so repeat clicks with
  no real changes don't create empty commits).

Runs on port `8743` and auto-opens the browser via `webbrowser.open()`.

## GitHub setup

- Repo: `worn-compass/uhills_lunch`, authenticated locally via `gh auth
  login` (HTTPS protocol; `gh` manages the git credential helper, so
  `git push` from server.py's subprocess works non-interactively).
- Git identity for commits is set **locally to this repo only** (not
  global): `user.email njlemanski@proton.me`, `user.name njlemanski`.
- **Why the repo is public:** GitHub Pages on the free plan doesn't
  support private repos (confirmed via `gh api .../pages` returning a 422
  plan error). The user originally wanted it private but agreed to make
  it public once we confirmed the content is just the school's own public
  menu data — no personal information about the family is in this repo.
- Pages source: branch `main`, folder `/docs` (configured via `gh api
  repos/worn-compass/uhills_lunch/pages`).

## Extending this later

To add a third school/program, roughly:
1. In `scraper/scrape_menu.py`, add its slug + menu type(s) and decide
   whether it's "choice" style (like U Hills — reuse
   `build_choice_day`/`MEAL_PATH_SECTIONS` etc.) or "flat/served" style
   (like Pre-K — reuse the `scrape_prek` pattern). Write its own
   `docs/data/<name>.json`.
2. In `docs/app.js`, add an entry to the `TABS` object and a render path
   for its data shape (reuse `renderUhillsDay`/`renderPrekDay` patterns as
   a starting point).
3. Add a `<button class="tab-btn" data-tab="...">` to the tab bar in
   `docs/index.html`.
4. Run `Start Lunch App.command`, hit Refresh & Publish, verify locally,
   done — no separate deploy step needed beyond that button.
