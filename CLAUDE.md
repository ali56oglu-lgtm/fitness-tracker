# Fitness Tracker — Project Guide for Claude

This file is the handoff/context for working on this project. Read it fully before making changes.

## What this is
A personal **workout tracker web app**, built as the owner's first coding project.
- **Plain HTML + CSS + JavaScript. No frameworks, no build tools, no npm.** Keep it that way unless explicitly asked to change.
- Runs by simply opening `index.html` in a browser.
- Hosted live on **GitHub Pages**: https://ali56oglu-lgtm.github.io/fitness-tracker/
- GitHub repo (public): `ali56oglu-lgtm/fitness-tracker`

## Who I'm working with (the owner)
- **New to coding.** Explain methodology briefly as we go so they keep learning, but don't over-explain basics they've already shown they know.
- Prefers I **lead with a clear recommendation** rather than a long menu of options.
- Based in **Turkey (Europe/Istanbul, UTC+3)** — this matters for date logic (see timezone note below).
- Values **honesty about uncertainty**. The Hevy design is reproduced from general familiarity, not pixel-exact — say so. Never present guesses as fact.
- Likes the app kept **beginner-friendly and well-commented** so the code is readable/learnable.

## How to work here
- Keep code **simple and heavily commented**. Match the existing comment density and style.
- After editing `app.js`, sanity-check with: `node --check app.js`.
- **Deploy workflow:** changes go live on the phone URL via GitHub Pages after a push:
  ```
  cd c:\Users\ali56\Documents\fitness-tracker
  git add .
  git commit -m "what changed"
  git push
  ```
  Pages rebuilds ~1 min after each push. Commit/push when the owner approves a checkpoint.
- Environment: **Windows, PowerShell.** `git` and the **GitHub CLI (`gh`)** are installed and authenticated as `ali56oglu-lgtm`. `gh` lives at `C:\Program Files\GitHub CLI\gh.exe`; in fresh shells refresh PATH before calling it.
- Data is **per-device** (localStorage) — no cross-device sync yet.

## Design language (Hevy-inspired, dark theme) — MAINTAIN THIS
Modeled on the **Hevy** workout app. Honesty: approximated from familiarity, not exact.
- **Theme:** dark. Tokens live in `:root` in `style.css`:
  - bg `#0e0f12`, surface `#1a1c22`, surface-2 `#24262e`, border `#2c2f38`
  - text `#f4f5f7`, muted `#9a9da6`
  - **accent (Hevy blue) `#2f6dff`**, accent-hover `#245ee0`
  - green (completed) `#22c55e`, danger `#f87171`
  - radius 14px (cards), 10px (inputs/buttons)
- **Font:** **Inter** (loaded from Google Fonts in `index.html`). Bold numbers, medium labels, tabular numerals for times/numbers.
- **Shapes:** rounded rectangles, minimal hard borders, separation via background shading, generous padding. Pill-shaped timer/rest buttons.
- **Core UI pattern:** each exercise is a card containing a **set table** — columns are `SET | <fields> | ✓`. Completing a set turns the row green.

### Pending design task (next up)
> **Restyle to use the whole page and evolve the design beyond simple stacked boxes** — better visual hierarchy, multi-column / wider layout where it helps, and make sure it's genuinely mobile-friendly (it's used on a phone via the Pages URL). Keep the Hevy language above.

## Functionality (current state) — MAINTAIN THIS
### Data model (localStorage)
- Keys: `fitness-tracker-active` (in-progress workout) and `fitness-tracker-history` (finished workouts).
- **Workout (session):** `{ id, date, category, exercises: [...] }`
- **Exercise:** `{ name, sets: [...] }`
- **Set:** `{ weight, reps, duration, distance, completed }` (unused fields stay empty)

### Categories (one per whole session; default "Other")
The session category decides which input columns every set shows:
| Category | Set columns |
|---|---|
| Weight Lifting | Kg · Reps |
| Interval Training | Time · Kg (both optional) |
| Cardio | Time · Km |
| Other | Kg · Reps · Time · Km (everything) |
- Chosen on the Start screen; changeable mid-session via the dropdown in the session header.

### Logging flow (Hevy-style)
- **Start workout** → add exercises by name → each gets a set table.
- Type values per set; tap **✓** to complete (row turns green).
- **+ Add set**, **✕** removes an exercise, live **session volume** (= Σ weight×reps) updates as you type.
- **Finish workout** saves to History; **Discard** drops it. History shows date, category badge, set summary, and volume.

### Rest timer
- **Auto-starts at 90s** when a set is completed; also startable via the **⏱** button on an exercise.
- Fixed pill bar at the bottom: **−15s / +15s / Skip**, beep + green "Done" flash at zero.
- Lives OUTSIDE the re-rendered active area so redraws don't interrupt it.

### Duration / time input (for timed categories)
- The **Time** cell is tappable → inline panel: **⏱ Use timer** or **⌨ Enter manually**.
- **Timer:** live `mm:ss` stopwatch with Start/Pause/Log (Log writes elapsed time into the set).
- **Manual:** **stopwatch-style digit entry** — digits fill from the right: `1`→`0:01`, `11`→`0:11`, `111`→`1:11`, `1111`→`11:11`. Backspace removes a digit; Enter finishes.
- **Durations are stored as whole SECONDS and displayed as `mm:ss`** everywhere (cell, history, timer log). Helpers in `app.js`: `formatSeconds`, `formatDigits`, `digitsToSeconds`, `secondsToDigits`.
- Known deferred edge case: typing a seconds-pair > 59 displays literally as you type (like a phone keypad); auto-normalize-on-commit was left for later.

### Stats strip
- Total workouts (all time), workouts this week, kg volume this week.
- "This week" = last 7 days including today.

### Timezone note (important)
The owner is in UTC+3. An earlier bug came from parsing `YYYY-MM-DD` as UTC while comparing to local "now". **Always build/compare dates in LOCAL time** — use `parseLocalDate()` and `todayString()`, never `new Date("YYYY-MM-DD")` for date math.

## Files
- `index.html` — structure: stats strip, `#activeArea` (filled by JS), History, the fixed rest-timer bar, Inter font + `style.css` links.
- `style.css` — the dark Hevy theme and all component styles.
- `app.js` — all behavior: storage, rendering (via `innerHTML` + event delegation), categories, rest timer, activity stopwatch, time helpers.
- `README.md` — short public-facing description.

## Rendering gotcha
`renderActive()` rebuilds `#activeArea` with `innerHTML`. So:
- Don't re-render on every keystroke (it would interrupt typing). Number inputs update data + live volume only.
- Timers keep their state in JS variables (not the DOM) and update elements by id, so redraws don't disrupt them.
