/*
  app.js — the BEHAVIOR of the app.
  This is JavaScript: it reads what you type, saves it, and updates the page.

  How data is stored:
  We use the browser's "localStorage" — a tiny built-in storage box that keeps
  your workouts even after you close the tab. No database or internet needed.
*/

// The key (a label) under which we save our data in localStorage.
const STORAGE_KEY = "fitness-tracker-workouts";

// Grab the parts of the page we need to interact with.
const form = document.getElementById("workoutForm");
const list = document.getElementById("workoutList");
const emptyMessage = document.getElementById("emptyMessage");

// --- Loading & saving -------------------------------------------------

// Read the saved workouts from localStorage. Returns an array.
function loadWorkouts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  // If nothing saved yet, start with an empty list.
  return raw ? JSON.parse(raw) : [];
}

// Write the workouts array back into localStorage.
function saveWorkouts(workouts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
}

// --- Helpers ----------------------------------------------------------

// Returns true if the given date string (YYYY-MM-DD) is within the last 7 days.
function isThisWeek(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  return date >= sevenDaysAgo && date <= now;
}

// --- Drawing the page -------------------------------------------------

// Update the three summary numbers at the top.
function updateStats(workouts) {
  const weekWorkouts = workouts.filter((w) => isThisWeek(w.date));
  const weekMinutes = weekWorkouts.reduce((sum, w) => sum + w.duration, 0);

  document.getElementById("totalWorkouts").textContent = workouts.length;
  document.getElementById("weekWorkouts").textContent = weekWorkouts.length;
  document.getElementById("weekMinutes").textContent = weekMinutes;
}

// Rebuild the visible list of workouts from the data.
function render() {
  const workouts = loadWorkouts();

  // Show the "no workouts yet" message only when the list is empty.
  emptyMessage.style.display = workouts.length === 0 ? "block" : "none";

  // Newest first.
  const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Clear the list, then add one row per workout.
  list.innerHTML = "";
  sorted.forEach((workout) => {
    const li = document.createElement("li");
    li.className = "workout-item";

    const notesText = workout.notes ? ` · ${workout.notes}` : "";
    li.innerHTML = `
      <div class="workout-info">
        <strong>${workout.exercise}</strong>
        <div class="workout-meta">${workout.duration} min · ${workout.date}${notesText}</div>
      </div>
      <button class="delete-btn" data-id="${workout.id}">Delete</button>
    `;
    list.appendChild(li);
  });

  updateStats(workouts);
}

// --- Events -----------------------------------------------------------

// When the form is submitted, create a new workout and save it.
form.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from reloading

  const newWorkout = {
    id: Date.now(), // a simple unique id based on the current time
    exercise: document.getElementById("exercise").value.trim(),
    duration: Number(document.getElementById("duration").value),
    date: document.getElementById("date").value,
    notes: document.getElementById("notes").value.trim(),
  };

  const workouts = loadWorkouts();
  workouts.push(newWorkout);
  saveWorkouts(workouts);

  form.reset();
  render();
});

// Delete a workout when its Delete button is clicked.
list.addEventListener("click", (event) => {
  if (!event.target.classList.contains("delete-btn")) return;

  const idToDelete = Number(event.target.dataset.id);
  const workouts = loadWorkouts().filter((w) => w.id !== idToDelete);
  saveWorkouts(workouts);
  render();
});

// --- Start ------------------------------------------------------------

// Pre-fill the date field with today's date for convenience.
document.getElementById("date").valueAsDate = new Date();

// Draw the page for the first time when it loads.
render();
