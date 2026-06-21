/*
  app.js — the app's behavior, Hevy-style, now with workout categories + a rest timer.

  Data model:
  - A WORKOUT (session) = { id, date, category, exercises: [...] }
  - An EXERCISE          = { name, sets: [...] }
  - A SET                = { weight, reps, duration, distance, completed }

  The session's CATEGORY decides which input columns each set shows.
*/

const ACTIVE_KEY = "fitness-tracker-active";
const HISTORY_KEY = "fitness-tracker-history";
const DEFAULT_REST_SECONDS = 90;

// Each category lists which input fields its sets ask for, in order.
const CATEGORIES = {
  "Weight Lifting": ["weight", "reps"],
  "Interval Training": ["duration", "weight"],
  "Cardio": ["duration", "distance"],
  "Other": ["weight", "reps", "duration", "distance"],
};

// How each field looks and behaves.
const FIELDS = {
  weight: { label: "Kg", step: "0.5", suffix: "kg" },
  reps: { label: "Reps", step: "1", suffix: "reps" },
  duration: { label: "Time", step: "0.5", suffix: "" },
  distance: { label: "Km", step: "0.1", suffix: "km" },
};

// Page areas.
const activeArea = document.getElementById("activeArea");
const historyList = document.getElementById("historyList");
const emptyHistory = document.getElementById("emptyHistory");

// ---- Storage helpers -------------------------------------------------

function loadActive() {
  const raw = localStorage.getItem(ACTIVE_KEY);
  return raw ? JSON.parse(raw) : null;
}
function saveActive(workout) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(workout));
}
function clearActive() {
  localStorage.removeItem(ACTIVE_KEY);
}
function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}
function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// ---- Date helpers (local time, to avoid timezone bugs) ---------------

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function isThisWeek(dateString) {
  const date = parseLocalDate(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  return date >= sevenDaysAgo && date <= today;
}

// ---- Volume helpers (volume = weight x reps, summed) -----------------

function workoutVolume(workout) {
  let total = 0;
  workout.exercises.forEach((ex) => {
    ex.sets.forEach((set) => {
      if (set.weight && set.reps) total += set.weight * set.reps;
    });
  });
  return total;
}

// The fields to show for a given category (falls back to "Other").
function fieldsFor(category) {
  return CATEGORIES[category] || CATEGORIES["Other"];
}

// ---- Time helpers (durations are stored as whole SECONDS) ------------

// Seconds -> "m:ss" (or "h:mm:ss" past an hour). Used for display.
function formatSeconds(total) {
  total = Math.round(Number(total) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

// A "digit buffer" (e.g. "111") is how stopwatch-style entry works: the last
// two digits are seconds, the next two minutes, the rest hours.
// "111" -> "1:11", "1111" -> "11:11".
function formatDigits(digits) {
  const s = digits.slice(-2).padStart(2, "0");
  if (digits.length <= 2) return `0:${s}`;
  const m = digits.slice(-4, -2);
  if (digits.length <= 4) return `${parseInt(m, 10)}:${s}`;
  const h = digits.slice(0, -4);
  return `${parseInt(h, 10)}:${m.padStart(2, "0")}:${s}`;
}

// Digit buffer -> total seconds (or "" when empty).
function digitsToSeconds(digits) {
  if (!digits) return "";
  const s = parseInt(digits.slice(-2) || "0", 10);
  const m = parseInt(digits.slice(-4, -2) || "0", 10);
  const h = parseInt(digits.slice(0, -4) || "0", 10);
  return h * 3600 + m * 60 + s;
}

// Total seconds -> digit buffer, used to seed manual editing from a value.
function secondsToDigits(total) {
  if (!total) return "";
  total = Math.round(Number(total));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const str =
    String(h) + String(m).padStart(2, "0") + String(s).padStart(2, "0");
  return str.replace(/^0+/, "").slice(-6);
}

// ---- The in-memory "active workout" ----------------------------------

let active = loadActive();

// UI state for the special "duration" field and its stopwatch.
let durationUI = null;     // { exIndex, setIndex, mode: 'choose' | 'timer' | 'manual' }
let activeTimer = null;    // { accumulatedMs, running, startTs } while a timer is open
let activityInterval = null; // the setInterval that updates the live readout

// ---- Stats strip -----------------------------------------------------

function updateStats() {
  const history = loadHistory();
  const week = history.filter((w) => isThisWeek(w.date));
  const weekVol = week.reduce((sum, w) => sum + workoutVolume(w), 0);

  document.getElementById("totalWorkouts").textContent = history.length;
  document.getElementById("weekWorkouts").textContent = week.length;
  document.getElementById("weekVolume").textContent = Math.round(weekVol);
}

// ---- Active workout rendering ----------------------------------------

// A grid-columns style string: 40px for "set #", one column per field, 44px for ✓.
function gridStyle(fieldCount) {
  return `grid-template-columns: 40px ${"1fr ".repeat(fieldCount)}44px`;
}

// <option> tags for the category dropdown, marking the current one selected.
function categoryOptions(selected) {
  return Object.keys(CATEGORIES)
    .map((c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`)
    .join("");
}

// Render one input cell. "duration" is special: it can be typed OR timed.
function fieldCellHTML(field, set, exIndex, setIndex) {
  if (field === "duration") {
    const isManual =
      durationUI &&
      durationUI.exIndex === exIndex &&
      durationUI.setIndex === setIndex &&
      durationUI.mode === "manual";
    if (isManual) {
      // The user chose "enter manually": a stopwatch-style time field where
      // typed digits fill in from the right (1 -> 0:01, 111 -> 1:11).
      const val = formatDigits(durationUI.digits || "");
      return `<input class="set-input time-input" type="text" inputmode="numeric"
                value="${val}" autofocus />`;
    }
    // Otherwise show a tappable cell (mm:ss, or a ⏱ icon when empty).
    const shown =
      set.duration !== "" && set.duration != null ? formatSeconds(set.duration) : "⏱";
    return `<button class="set-input duration-cell" data-action="duration-open"
              title="Tap to time it or enter manually">${shown}</button>`;
  }
  const meta = FIELDS[field];
  return `<input class="set-input" type="number" min="0" step="${meta.step}"
            inputmode="decimal" placeholder="0"
            value="${set[field] ?? ""}" data-field="${field}" />`;
}

function setRowHTML(set, fields, exIndex, setIndex) {
  const done = set.completed ? "completed" : "";
  const cells = fields.map((f) => fieldCellHTML(f, set, exIndex, setIndex)).join("");
  return `
    <div class="set-row ${done}" data-ex="${exIndex}" data-set="${setIndex}" style="${gridStyle(fields.length)}">
      <span class="set-num">${setIndex + 1}</span>
      ${cells}
      <button class="set-check" data-action="toggle" title="Mark set complete">✓</button>
    </div>`;
}

// The inline panel shown under a set when its duration cell is being used.
function durationPanelHTML(exIndex, setIndex) {
  if (
    !durationUI ||
    durationUI.exIndex !== exIndex ||
    durationUI.setIndex !== setIndex
  ) {
    return "";
  }

  if (durationUI.mode === "choose") {
    return `
      <div class="time-panel">
        <span class="time-panel-q">Log time by…</span>
        <div class="time-panel-btns">
          <button class="btn-secondary" data-action="duration-timer">⏱ Use timer</button>
          <button class="btn-secondary" data-action="duration-manual">⌨ Enter manually</button>
          <button class="btn-ghost" data-action="duration-close">Cancel</button>
        </div>
      </div>`;
  }

  if (durationUI.mode === "timer") {
    const label = activeTimer && activeTimer.running ? "Pause" : "Start";
    return `
      <div class="time-panel timer-panel">
        <div class="timer-readout">
          <span class="timer-display" id="activityTimerDisplay">0:00</span>
          <span class="timer-preview">Stopwatch</span>
        </div>
        <div class="time-panel-btns">
          <button class="btn-secondary" data-action="timer-toggle">${label}</button>
          <button class="btn-primary" data-action="timer-log">Log</button>
          <button class="btn-ghost" data-action="timer-cancel">Cancel</button>
        </div>
      </div>`;
  }

  // manual mode: a small way back to the timer.
  return `
    <div class="time-panel">
      <button class="btn-ghost" data-action="duration-timer">⏱ Use timer instead</button>
      <button class="btn-ghost" data-action="duration-close">Done</button>
    </div>`;
}

function exerciseHTML(exercise, fields, exIndex) {
  const headerCols = fields.map((f) => `<span>${FIELDS[f].label}</span>`).join("");
  const rows = exercise.sets
    .map((s, i) => setRowHTML(s, fields, exIndex, i) + durationPanelHTML(exIndex, i))
    .join("");
  return `
    <div class="exercise" data-ex="${exIndex}">
      <div class="exercise-head">
        <h3>${exercise.name}</h3>
        <div class="exercise-actions">
          <button class="icon-btn" data-action="remove-exercise" title="Remove exercise">✕</button>
        </div>
      </div>
      <div class="set-header" style="${gridStyle(fields.length)}">
        <span>Set</span>${headerCols}<span></span>
      </div>
      ${rows}
      <!-- Full-width button under the set rows: starts the rest countdown, which
           then shows in the floating bar that follows you as you scroll. -->
      <button class="rest-trigger" data-action="rest" title="Start rest timer">⏱ Rest Timer</button>
      <button class="add-set" data-action="add-set">+ Add set</button>
    </div>`;
}

function renderActive() {
  if (!active) {
    activeArea.innerHTML = `
      <div class="start-card">
        <p>Ready to train? Pick a type and start.</p>
        <div class="start-controls">
          <select id="startCategory" class="select">${categoryOptions("Other")}</select>
          <button class="btn-primary" data-action="start">Start workout</button>
        </div>
      </div>`;
    return;
  }

  const fields = fieldsFor(active.category);
  const exercises = active.exercises.map((ex, i) => exerciseHTML(ex, fields, i)).join("");

  activeArea.innerHTML = `
    <div class="session">
      <div class="session-head">
        <div>
          <h2>Active workout</h2>
          <span class="muted">${active.date}</span>
        </div>
        <div class="session-right">
          <div class="session-volume"><span id="sessionVolume">0</span> kg</div>
          <button class="btn-ghost" data-action="discard">Discard</button>
        </div>
      </div>

      <select id="sessionCategory" class="select session-category">${categoryOptions(active.category)}</select>

      ${exercises}

      <div class="add-exercise">
        <input id="exerciseName" type="text" placeholder="Exercise name (e.g. Bench Press)" />
        <button class="btn-secondary" data-action="add-exercise">+ Add</button>
      </div>

      <button class="btn-primary big" data-action="finish">Finish workout</button>
    </div>`;

  updateSessionVolume();
  if (durationUI && durationUI.mode === "timer") updateActivityDisplay();
}

function updateSessionVolume() {
  if (!active) return;
  const el = document.getElementById("sessionVolume");
  if (el) el.textContent = Math.round(workoutVolume(active));
}

// ---- History rendering -----------------------------------------------

// A short human label for one set, e.g. "60kg · 10 reps" or "30min · 5km".
function setSummary(set) {
  const segs = [];
  if (set.weight) segs.push(`${set.weight}kg`);
  if (set.reps) segs.push(`${set.reps} reps`);
  if (set.duration) segs.push(formatSeconds(set.duration));
  if (set.distance) segs.push(`${set.distance}km`);
  return segs.join(" · ");
}

function renderHistory() {
  const history = loadHistory();
  emptyHistory.style.display = history.length === 0 ? "block" : "none";

  const sorted = [...history].sort(
    (a, b) => parseLocalDate(b.date) - parseLocalDate(a.date)
  );

  historyList.innerHTML = sorted
    .map((w) => {
      const setCount = w.exercises.reduce((n, ex) => n + ex.sets.length, 0);
      const lines = w.exercises
        .map((ex) => {
          const sets = ex.sets.map((s) => setSummary(s)).filter(Boolean).join("  |  ");
          return `<li><strong>${ex.name}</strong> <span class="sets">${sets}</span></li>`;
        })
        .join("");
      return `
        <div class="history-card">
          <div class="history-head">
            <div>
              <strong>${w.date}</strong>
              <span class="category-badge">${w.category || "Other"}</span>
            </div>
            <button class="delete-btn" data-action="delete-history" data-id="${w.id}">Delete</button>
          </div>
          <div class="muted">${w.exercises.length} exercises · ${setCount} sets · ${Math.round(
        workoutVolume(w)
      )} kg volume</div>
          <ul class="history-exercises">${lines}</ul>
        </div>`;
    })
    .join("");
}

function render() {
  renderActive();
  renderHistory();
  updateStats();
}

// ---- Actions ---------------------------------------------------------

function startWorkout() {
  const sel = document.getElementById("startCategory");
  const category = sel ? sel.value : "Other";
  active = { id: Date.now(), date: todayString(), category, exercises: [] };
  saveActive(active);
  render();
}

function addExercise() {
  const input = document.getElementById("exerciseName");
  const name = input.value.trim();
  if (!name) return;
  active.exercises.push({ name, sets: [newSet()] });
  saveActive(active);
  renderActive();
}

// A blank set holds every possible field; only the relevant ones are shown.
function newSet() {
  return { weight: "", reps: "", duration: "", distance: "", completed: false };
}

function addSet(exIndex) {
  active.exercises[exIndex].sets.push(newSet());
  saveActive(active);
  renderActive();
}

function removeExercise(exIndex) {
  active.exercises.splice(exIndex, 1);
  saveActive(active);
  renderActive();
}

function toggleComplete(exIndex, setIndex) {
  const set = active.exercises[exIndex].sets[setIndex];
  set.completed = !set.completed;
  saveActive(active);
  renderActive();
  // Completing a set auto-starts the rest timer (Hevy behavior).
  if (set.completed) startRest(DEFAULT_REST_SECONDS);
}

function finishWorkout() {
  const hasSets = active.exercises.some((ex) => ex.sets.length > 0);
  if (!hasSets) {
    discardWorkout();
    return;
  }
  const history = loadHistory();
  history.push(active);
  saveHistory(history);
  active = null;
  clearActive();
  stopRest();
  clearActivityInterval();
  activeTimer = null;
  durationUI = null;
  render();
}

function discardWorkout() {
  active = null;
  clearActive();
  stopRest();
  clearActivityInterval();
  activeTimer = null;
  durationUI = null;
  render();
}

function deleteHistory(id) {
  const history = loadHistory().filter((w) => w.id !== Number(id));
  saveHistory(history);
  renderHistory();
  updateStats();
}

// ---- Activity timer (stopwatch for timed sets) -----------------------
// Counts UP. The state lives in `activeTimer` (not the DOM), so redraws of
// the active area don't disturb a running timer; each tick just refreshes
// the readout element by id.

function clearActivityInterval() {
  if (activityInterval) {
    clearInterval(activityInterval);
    activityInterval = null;
  }
}

// Total elapsed time so far (paused total + current run, if running).
function activityElapsedMs() {
  if (!activeTimer) return 0;
  return activeTimer.accumulatedMs + (activeTimer.running ? Date.now() - activeTimer.startTs : 0);
}

// Refresh the live mm:ss readout and the "= X min" preview.
function updateActivityDisplay() {
  const ms = activityElapsedMs();
  const disp = document.getElementById("activityTimerDisplay");
  if (disp) disp.textContent = formatSeconds(Math.floor(ms / 1000));
}

// Tapping the duration cell: open the "timer vs manual" chooser.
function openDurationChooser(exIndex, setIndex) {
  clearActivityInterval(); // only one timer open at a time
  activeTimer = null;
  durationUI = { exIndex, setIndex, mode: "choose" };
  renderActive();
}

function chooseManual() {
  if (!durationUI) return;
  durationUI.mode = "manual";
  // Seed the digit buffer from any value already on the set.
  const set = active.exercises[durationUI.exIndex].sets[durationUI.setIndex];
  durationUI.digits = secondsToDigits(set.duration);
  renderActive();
}

// Handle a keystroke inside a stopwatch-style time field.
function handleTimeKeydown(event) {
  if (!durationUI) return;
  const input = event.target;
  const key = event.key;
  const digits = durationUI.digits || "";

  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    durationUI.digits = (digits + key).replace(/^0+/, "").slice(-6);
    commitTimeInput(input);
  } else if (key === "Backspace") {
    event.preventDefault();
    durationUI.digits = digits.slice(0, -1);
    commitTimeInput(input);
  } else if (key === "Enter") {
    event.preventDefault();
    input.blur();
  }
  // Tab / arrows / etc. behave normally.
}

// Re-render the field text and save the value (in seconds) as you type.
function commitTimeInput(input) {
  if (!durationUI) return;
  input.value = formatDigits(durationUI.digits);
  const set = active.exercises[durationUI.exIndex].sets[durationUI.setIndex];
  set.duration = digitsToSeconds(durationUI.digits);
  saveActive(active);
  updateSessionVolume();
  const end = input.value.length;
  input.setSelectionRange(end, end); // keep the cursor at the end
}

function chooseTimer() {
  if (!durationUI) return;
  durationUI.mode = "timer";
  activeTimer = { accumulatedMs: 0, running: false, startTs: null };
  renderActive();
}

// Start <-> Pause.
function toggleActivityTimer() {
  if (!activeTimer) return;
  if (activeTimer.running) {
    activeTimer.accumulatedMs += Date.now() - activeTimer.startTs;
    activeTimer.running = false;
    activeTimer.startTs = null;
    clearActivityInterval();
  } else {
    activeTimer.running = true;
    activeTimer.startTs = Date.now();
    if (!activityInterval) activityInterval = setInterval(updateActivityDisplay, 250);
  }
  renderActive();
  updateActivityDisplay();
}

// Save the elapsed time (as minutes) into the set, then close.
function logActivityTimer() {
  if (!durationUI || !activeTimer) return;
  const seconds = Math.round(activityElapsedMs() / 1000);
  active.exercises[durationUI.exIndex].sets[durationUI.setIndex].duration = seconds;
  saveActive(active);
  closeDuration();
  updateSessionVolume();
}

// Close/cancel the duration UI and discard any open (unlogged) timer.
function closeDuration() {
  clearActivityInterval();
  activeTimer = null;
  durationUI = null;
  renderActive();
}

// ---- Rest timer ------------------------------------------------------
// Kept OUTSIDE the re-rendered active area so redraws don't interrupt it.

const restTimerEl = document.getElementById("restTimer");
const restTimeEl = document.getElementById("restTime");
let restEndTime = null;   // timestamp (ms) when the rest ends
let restInterval = null;  // the running setInterval

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startRest(seconds) {
  restEndTime = Date.now() + seconds * 1000;
  restTimerEl.hidden = false;
  restTimerEl.classList.remove("done");
  if (restInterval) clearInterval(restInterval);
  restInterval = setInterval(tickRest, 250);
  tickRest();
}

function tickRest() {
  const remaining = Math.round((restEndTime - Date.now()) / 1000);
  if (remaining <= 0) {
    restTimeEl.textContent = "0:00";
    finishRest();
    return;
  }
  restTimeEl.textContent = formatTime(remaining);
}

function adjustRest(deltaSeconds) {
  if (restEndTime === null) return;
  restEndTime += deltaSeconds * 1000;
  if (restEndTime < Date.now()) restEndTime = Date.now();
  tickRest();
}

// Rest reached zero: beep, flash "Done", then hide.
function finishRest() {
  clearInterval(restInterval);
  restInterval = null;
  restEndTime = null;
  beep();
  restTimerEl.classList.add("done");
  restTimeEl.textContent = "Done";
  setTimeout(() => {
    restTimerEl.hidden = true;
    restTimerEl.classList.remove("done");
  }, 1500);
}

// Skip/stop the rest. `finished=false` just hides it without the beep.
function stopRest() {
  if (restInterval) clearInterval(restInterval);
  restInterval = null;
  restEndTime = null;
  restTimerEl.hidden = true;
  restTimerEl.classList.remove("done");
}

// A short beep using the Web Audio API (no sound file needed).
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {
    // Some browsers block audio until you interact — safe to ignore.
  }
}

restTimerEl.addEventListener("click", (event) => {
  const action = event.target.dataset.rest;
  if (action === "adjust") adjustRest(Number(event.target.dataset.delta));
  else if (action === "skip") stopRest();
});

// ---- Events on the active area (delegation) --------------------------

activeArea.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (!action) return;

  const exEl = event.target.closest("[data-ex]");
  const exIndex = exEl ? Number(exEl.dataset.ex) : null;
  const rowEl = event.target.closest(".set-row");
  const setIndex = rowEl ? Number(rowEl.dataset.set) : null;

  if (action === "start") startWorkout();
  else if (action === "add-exercise") addExercise();
  else if (action === "add-set") addSet(exIndex);
  else if (action === "remove-exercise") removeExercise(exIndex);
  else if (action === "toggle") toggleComplete(exIndex, setIndex);
  else if (action === "rest") startRest(DEFAULT_REST_SECONDS);
  else if (action === "finish") finishWorkout();
  else if (action === "discard") discardWorkout();
  // Duration field: chooser + stopwatch.
  else if (action === "duration-open") openDurationChooser(exIndex, setIndex);
  else if (action === "duration-manual") chooseManual();
  else if (action === "duration-timer") chooseTimer();
  else if (action === "duration-close") closeDuration();
  else if (action === "timer-toggle") toggleActivityTimer();
  else if (action === "timer-log") logActivityTimer();
  else if (action === "timer-cancel") closeDuration();
});

// Typing in a number box: save it and update live volume, without redrawing.
activeArea.addEventListener("input", (event) => {
  const input = event.target;
  if (input.classList.contains("time-input")) return; // handled in keydown
  if (!input.classList.contains("set-input")) return;

  const rowEl = input.closest(".set-row");
  const exIndex = Number(rowEl.dataset.ex);
  const setIndex = Number(rowEl.dataset.set);
  const field = input.dataset.field;

  const value = input.value === "" ? "" : Number(input.value);
  active.exercises[exIndex].sets[setIndex][field] = value;
  saveActive(active);
  updateSessionVolume();
});

// Changing the session category redraws with the new input columns.
activeArea.addEventListener("change", (event) => {
  if (event.target.id === "sessionCategory") {
    active.category = event.target.value;
    saveActive(active);
    renderActive();
  }
});

// Enter in the exercise-name box adds the exercise.
activeArea.addEventListener("keydown", (event) => {
  if (event.target.classList.contains("time-input")) {
    handleTimeKeydown(event);
    return;
  }
  if (event.key === "Enter" && event.target.id === "exerciseName") {
    event.preventDefault();
    addExercise();
  }
});

historyList.addEventListener("click", (event) => {
  if (event.target.dataset.action === "delete-history") {
    deleteHistory(event.target.dataset.id);
  }
});

// ---- Start the app ---------------------------------------------------
render();
