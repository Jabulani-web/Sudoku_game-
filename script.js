const el = id => document.getElementById(id);

const boardElement = el("board");
const boardWrap = el("board-wrap");
const difficultyElement = el("difficulty");
const timerElement = el("timer");
const mistakesElement = el("mistakes");
const hintsElement = el("hints-left");
const messageElement = el("message");
const notesButton = el("notes-button");
const autoNotesButton = el("auto-notes-button");
const undoButton = el("undo-button");
const hintButton = el("hint-button");
const pauseButton = el("pause-button");
const pauseOverlay = el("pause-overlay");
const resumeButton = el("resume-button");
const modeBadge = el("mode-badge");
const modal = el("modal");
const modalStats = el("modal-stats");
const themeToggle = el("theme-toggle");

const SIZE = 9;
const CELL_COUNT = 81;
const MAX_MISTAKES = 3;
const MAX_HINTS = 3;
const LEVEL_STEP = 250;
const HISTORY_LIMIT = 80;

const STORAGE = {
  best: "sudoku-best-times",
  progress: "sudoku-progress",
  daily: "sudoku-daily",
  theme: "sudoku-theme"
};

const difficultySettings = {
  easy: 36,
  medium: 46,
  hard: 52
};

const scoreBase = {
  easy: 420,
  medium: 680,
  hard: 940,
  daily: 820
};

const tips = [
  "Start with a row, column, or box that already has many numbers filled in.",
  "Before you guess, check what a single cell can possibly hold — then follow that thread.",
  "Use auto-notes when the grid gets dense; candidates reveal the only move.",
  "One number often unlocks a whole box. Place a digit, then rescan its row and column.",
  "No move is permanent. Undo is there so you can test an idea without fear.",
  "Slow down at the end. The last six squares are where tidy logic beats speed."
];

const confettiColors = ["#3b45d6", "#b0730f", "#146c43", "#e0a33a", "#9271f0", "#4b7cf3"];

let solution = [];
let puzzle = [];
let initialPuzzle = [];
let notes = [];
let selectedIndex = null;
let mistakes = 0;
let hintsLeft = MAX_HINTS;
let elapsedSeconds = 0;
let timerInterval = null;
let notesMode = false;
let autoNotes = false;
let paused = false;
let gameOver = false;
let gameWon = false;
let history = [];
let mode = "random";
let currentDailyKey = null;
let random = Math.random;

/* ---------- helpers ---------- */

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function pattern(row, column) {
  return (row * 3 + Math.floor(row / 3) + column) % SIZE;
}

function shuffledIndices() {
  const bands = shuffle([0, 1, 2]);
  const rows = bands.flatMap(band =>
    shuffle([0, 1, 2]).map(row => band * 3 + row)
  );

  const stacks = shuffle([0, 1, 2]);
  const columns = stacks.flatMap(stack =>
    shuffle([0, 1, 2]).map(column => stack * 3 + column)
  );

  return { rows, columns };
}

function generateSolution() {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const { rows, columns } = shuffledIndices();
  const transpose = random() < 0.5;

  return rows.map(row =>
    columns.map(column => {
      const r = transpose ? column : row;
      const c = transpose ? row : column;
      return digits[pattern(r, c)];
    })
  );
}

/**
 * Counts how many solutions a grid has, stopping at `limit`.
 * Mutates the grid while searching and restores it afterwards.
 */
function countSolutions(grid, limit = 2) {
  const rows = new Array(SIZE).fill(0);
  const cols = new Array(SIZE).fill(0);
  const boxes = new Array(SIZE).fill(0);
  let count = 0;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = grid[r][c];
      if (!value) continue;
      const bit = 1 << (value - 1);
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)] |= bit;
    }
  }

  function search() {
    if (count >= limit) return;

    let target = -1;
    let targetMask = 0;
    let fewest = 10;

    for (let index = 0; index < CELL_COUNT; index++) {
      const r = Math.floor(index / SIZE);
      const c = index % SIZE;
      if (grid[r][c]) continue;

      const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const used = rows[r] | cols[c] | boxes[box];
      let mask = 0;
      let options = 0;

      for (let value = 1; value <= 9; value++) {
        const bit = 1 << (value - 1);
        if (!(used & bit)) {
          mask |= bit;
          options++;
        }
      }

      if (options === 0) return;

      if (options < fewest) {
        fewest = options;
        target = index;
        targetMask = mask;
        if (options === 1) break;
      }
    }

    if (target < 0) {
      count++;
      return;
    }

    const r = Math.floor(target / SIZE);
    const c = target % SIZE;
    const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);

    for (let value = 1; value <= 9; value++) {
      const bit = 1 << (value - 1);
      if (!(targetMask & bit)) continue;

      grid[r][c] = value;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[box] |= bit;

      search();

      grid[r][c] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[box] &= ~bit;

      if (count >= limit) return;
    }
  }

  search();
  return count;
}

/**
 * Removes digits one at a time, keeping the grid uniquely solvable,
 * so every puzzle has exactly one answer.
 */
function carvePuzzle(fullSolution, blanks) {
  const grid = fullSolution.map(row => [...row]);
  const positions = shuffle(Array.from({ length: CELL_COUNT }, (_, index) => index));
  let removed = 0;

  for (const position of positions) {
    if (removed >= blanks) break;

    const row = Math.floor(position / SIZE);
    const column = position % SIZE;
    const saved = grid[row][column];

    grid[row][column] = 0;

    if (countSolutions(grid.map(line => [...line]), 2) === 1) {
      removed++;
    } else {
      grid[row][column] = saved;
    }
  }

  return grid;
}

function getValue(index) {
  return puzzle[Math.floor(index / SIZE)][index % SIZE];
}

function setValue(index, value) {
  puzzle[Math.floor(index / SIZE)][index % SIZE] = value;
}

function getSolutionValue(index) {
  return solution[Math.floor(index / SIZE)][index % SIZE];
}

function isGiven(index) {
  return initialPuzzle[Math.floor(index / SIZE)][index % SIZE] !== 0;
}

function getRow(index) {
  return Math.floor(index / SIZE);
}

function getColumn(index) {
  return index % SIZE;
}

function sameBox(a, b) {
  return (
    Math.floor(getRow(a) / 3) === Math.floor(getRow(b) / 3) &&
    Math.floor(getColumn(a) / 3) === Math.floor(getColumn(b) / 3)
  );
}

function areRelated(a, b) {
  return getRow(a) === getRow(b) || getColumn(a) === getColumn(b) || sameBox(a, b);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function showMessage(text, type = "") {
  messageElement.textContent = text;
  messageElement.className = `message ${type}`.trim();
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- persisted state ---------- */

function readBestTimes() {
  const stored = readStore(STORAGE.best, {});
  const best = {};

  for (const level of ["easy", "medium", "hard"]) {
    const value = stored[level];
    if (Number.isFinite(value) && value >= 0) best[level] = value;
  }

  return best;
}

function readDaily() {
  const stored = readStore(STORAGE.daily, {});
  const solved = stored && typeof stored.solved === "object" && stored.solved ? stored.solved : {};
  return { solved };
}

function readProgress() {
  const stored = readStore(STORAGE.progress, {});
  return {
    xp: Number.isFinite(stored.xp) && stored.xp > 0 ? Math.floor(stored.xp) : 0,
    solved: Number.isFinite(stored.solved) && stored.solved > 0 ? Math.floor(stored.solved) : 0
  };
}

function levelFor(xp) {
  return 1 + Math.floor(xp / LEVEL_STEP);
}

function dailyStreak() {
  const { solved } = readDaily();
  const cursor = new Date();

  if (!solved[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;

  while (solved[dateKey(cursor)] && streak < 3650) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function dailyBest() {
  const { solved } = readDaily();
  const times = Object.values(solved)
    .map(entry => (entry && Number.isFinite(entry.seconds) ? entry.seconds : null))
    .filter(value => value !== null);

  return times.length ? Math.min(...times) : null;
}

function renderProgress() {
  const progress = readProgress();
  const level = levelFor(progress.xp);
  const into = progress.xp % LEVEL_STEP;
  const percent = Math.round((into / LEVEL_STEP) * 100);
  const streak = dailyStreak();

  el("level-badge").textContent = `LVL ${level}`;
  el("hero-level").textContent = `Level ${level}`;
  el("hero-streak").textContent = streak;
  el("hero-solved").textContent = progress.solved;
  el("xp-into").textContent = into;
  el("xp-step").textContent = LEVEL_STEP;
  el("xp-bar").style.width = `${percent}%`;
  el("xp-bar").parentElement.setAttribute("aria-valuenow", String(percent));
  el("progress-solved").textContent = progress.solved;
  el("progress-streak").textContent = streak;

  renderDailyCard();
  renderBests();
}

function renderDailyCard() {
  const key = dateKey();
  const { solved } = readDaily();
  const entry = solved[key];
  const best = dailyBest();

  el("daily-date").textContent = prettyDate(key);
  el("daily-status").textContent = entry
    ? `Solved in ${formatTime(entry.seconds)} ✓`
    : "Not played yet";
  el("daily-best").textContent = best === null ? "--:--" : formatTime(best);
  el("daily-play").textContent = entry ? "Replay daily" : "Play daily";
  el("daily-button").innerHTML = entry
    ? '<span aria-hidden="true">✦</span> Replay today\'s daily'
    : '<span aria-hidden="true">✦</span> Play today\'s daily';
}

function renderBests() {
  const bests = readBestTimes();
  const daily = dailyBest();

  for (const level of ["easy", "medium", "hard"]) {
    const value = bests[level];
    el(`best-${level}`).textContent = Number.isFinite(value) ? formatTime(value) : "--:--";
  }

  el("best-daily").textContent = daily === null ? "--:--" : formatTime(daily);
}

function saveBestTime(seconds) {
  const bests = readBestTimes();
  const key = difficultyElement.value;
  const previous = bests[key];

  if (!Number.isFinite(previous) || seconds < previous) {
    bests[key] = seconds;
    writeStore(STORAGE.best, bests);
    return true;
  }

  return false;
}

function addXp(amount) {
  const progress = readProgress();
  progress.xp += amount;
  progress.solved += 1;
  writeStore(STORAGE.progress, progress);
  return progress;
}

/* ---------- notes ---------- */

function candidatesFor(index) {
  const used = new Set();
  const row = getRow(index);
  const column = getColumn(index);

  for (let i = 0; i < SIZE; i++) {
    used.add(puzzle[row][i]);
    used.add(puzzle[i][column]);
  }

  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      used.add(puzzle[boxRow + r][boxColumn + c]);
    }
  }

  const candidates = new Set();

  for (let number = 1; number <= 9; number++) {
    if (!used.has(number)) candidates.add(number);
  }

  return candidates;
}

function refreshAutoNotes() {
  if (!autoNotes) return;

  for (let index = 0; index < CELL_COUNT; index++) {
    notes[index] = getValue(index) === 0 ? candidatesFor(index) : new Set();
  }
}

function updateNotesButton() {
  notesButton.textContent = notesMode ? "✎ Notes: On" : "✎ Notes: Off";
  notesButton.setAttribute("aria-pressed", String(notesMode));
}

/* ---------- history ---------- */

function snapshot() {
  return {
    values: puzzle.flat(),
    notes: notes.map(set => [...set]),
    mistakes,
    hintsLeft,
    hinted: [...hintedCells],
    wrong: [...wrongCells]
  };
}

function pushHistory() {
  history.push(snapshot());

  if (history.length > HISTORY_LIMIT) history.shift();

  updateUndoButton();
}

function updateUndoButton() {
  undoButton.disabled = history.length === 0 || gameOver;
}

function undo() {
  if (gameOver) {
    showMessage("This game is finished. Start a new puzzle to keep playing.");
    return;
  }

  if (paused) {
    showMessage("Resume the game before undoing.");
    return;
  }

  const state = history.pop();

  if (!state) {
    showMessage("Nothing to undo yet.");
    return;
  }

  puzzle = [];

  for (let row = 0; row < SIZE; row++) {
    puzzle.push(state.values.slice(row * SIZE, row * SIZE + SIZE));
  }

  notes = state.notes.map(set => new Set(set));
  mistakes = state.mistakes;
  hintsLeft = state.hintsLeft;
  hintedCells = new Set(state.hinted);
  wrongCells = new Set(state.wrong);

  updateUndoButton();
  updateStats();
  renderBoard();
  showMessage("Last move undone.", "success");
}

/* ---------- rendering ---------- */

function renderBoard() {
  boardElement.innerHTML = "";

  const selectedValue = selectedIndex !== null ? getValue(selectedIndex) : 0;
  const duplicateCells = new Set();

  for (let index = 0; index < CELL_COUNT; index++) {
    const value = getValue(index);
    if (!value) continue;

    for (let other = index + 1; other < CELL_COUNT; other++) {
      if (getValue(other) === value && areRelated(index, other)) {
        duplicateCells.add(index);
        duplicateCells.add(other);
      }
    }
  }

  for (let index = 0; index < CELL_COUNT; index++) {
    const row = getRow(index);
    const column = getColumn(index);
    const value = getValue(index);
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute(
      "aria-label",
      `Row ${row + 1}, column ${column + 1}${value ? `, ${value}` : ", empty"}`
    );

    if (isGiven(index)) cell.classList.add("given");

    if (column === 2 || column === 5) cell.classList.add("box-right");
    if (row === 2 || row === 5) cell.classList.add("box-bottom");

    if (selectedIndex !== null && areRelated(index, selectedIndex)) {
      cell.classList.add("related");
    }

    if (selectedIndex !== null && value !== 0 && value === selectedValue) {
      cell.classList.add("same-number");
    }

    if (index === selectedIndex) {
      cell.classList.add("selected");
      cell.setAttribute("aria-selected", "true");
    }

    if (duplicateCells.has(index)) cell.classList.add("conflict");
    if (wrongCells.has(index)) cell.classList.add("wrong");
    if (hintedCells.has(index)) cell.classList.add("hinted");

    if (value !== 0) {
      cell.textContent = value;
    } else if (notes[index].size > 0) {
      cell.classList.add("notes-cell");

      const notesGrid = document.createElement("span");
      notesGrid.className = "notes-grid";

      for (let number = 1; number <= 9; number++) {
        const note = document.createElement("span");
        note.textContent = notes[index].has(number) ? number : "";
        notesGrid.appendChild(note);
      }

      cell.appendChild(notesGrid);
    }

    cell.disabled = gameOver || paused;
    cell.addEventListener("click", () => selectCell(index));
    boardElement.appendChild(cell);
  }

  updateNumberPad();
}

function updateNumberPad() {
  const correctCounts = new Array(10).fill(0);

  for (let index = 0; index < CELL_COUNT; index++) {
    const value = getValue(index);
    if (value && value === getSolutionValue(index)) correctCounts[value]++;
  }

  document.querySelectorAll(".number-button").forEach(button => {
    const number = Number(button.dataset.number);
    const remaining = Math.max(0, 9 - correctCounts[number]);
    const placed = selectedIndex !== null && getValue(selectedIndex) === number;

    button.querySelector(".left").textContent = remaining === 0 ? "✓" : remaining;
    button.classList.toggle("done", remaining === 0);
    button.setAttribute("aria-pressed", String(placed));
    button.setAttribute("aria-label", `Enter ${number}, ${remaining} remaining`);
    button.disabled = gameOver || paused || remaining === 0;
  });

  hintButton.disabled = gameOver || paused || hintsLeft <= 0;
  undoButton.disabled = history.length === 0 || gameOver || paused;
  notesButton.disabled = gameOver || paused;
  autoNotesButton.disabled = gameOver || paused;
  pauseButton.disabled = gameOver;
  el("check-button").disabled = gameOver || paused;
  el("reset-button").disabled = gameOver || paused;
}

function updateStats() {
  timerElement.textContent = formatTime(elapsedSeconds);
  mistakesElement.innerHTML = `${mistakes} <span class="stat-muted">/ ${MAX_MISTAKES}</span>`;
  hintsElement.textContent = hintsLeft;
}

function updateModeBadge() {
  if (mode === "daily" && currentDailyKey) {
    modeBadge.textContent = `DAILY · ${prettyDate(currentDailyKey).toUpperCase()}`;
    modeBadge.classList.add("daily");
  } else {
    modeBadge.textContent = `RANDOM · ${difficultyElement.value.toUpperCase()}`;
    modeBadge.classList.remove("daily");
  }
}

/* ---------- timer ---------- */

function startTimer() {
  stopTimer();

  timerInterval = setInterval(() => {
    if (gameOver || paused) return;
    elapsedSeconds++;
    timerElement.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

/* ---------- interaction ---------- */

function selectCell(index) {
  if (gameOver || paused) return;
  selectedIndex = index;
  renderBoard();
}

function toggleNote(number) {
  if (getValue(selectedIndex) !== 0) {
    showMessage("Erase this square before adding notes.");
    return;
  }

  pushHistory();

  if (notes[selectedIndex].has(number)) {
    notes[selectedIndex].delete(number);
  } else {
    notes[selectedIndex].add(number);
  }

  renderBoard();
  showMessage("Notes updated.");
}

function enterNumber(number) {
  if (gameOver) return;

  if (paused) {
    showMessage("Resume the game to keep playing.");
    return;
  }

  if (selectedIndex === null) {
    showMessage("Select an empty square first.");
    return;
  }

  if (isGiven(selectedIndex)) {
    showMessage("That number is part of the original puzzle.");
    return;
  }

  if (notesMode) {
    if (autoNotes) {
      showMessage("Auto-notes keeps notes in sync. Turn it off to edit them by hand.");
      return;
    }

    toggleNote(number);
    return;
  }

  const index = selectedIndex;

  if (getValue(index) === number) {
    showMessage("That number is already in this square.");
    return;
  }

  pushHistory();

  wrongCells.delete(index);
  hintedCells.delete(index);
  notes[index].clear();
  setValue(index, number);

  if (number !== getSolutionValue(index)) {
    mistakes++;
    updateStats();

    if (mistakes >= MAX_MISTAKES) {
      refreshAutoNotes();
      updateStats();
      renderBoard();
      finishGame(false, "Three mistakes. The grid locks here.");
      return;
    }

    showMessage(
      `Not quite. ${MAX_MISTAKES - mistakes} mistake${MAX_MISTAKES - mistakes === 1 ? "" : "s"} left.`,
      "error"
    );
  } else {
    showMessage("Correct number. Keep going.", "success");
  }

  refreshAutoNotes();
  renderBoard();
  updateStats();

  if (isSolved()) finishGame(true);
}

function eraseSelected() {
  if (gameOver || paused) return;

  if (selectedIndex === null) {
    showMessage("Select a square to erase.");
    return;
  }

  if (isGiven(selectedIndex)) {
    showMessage("You cannot erase a fixed number.");
    return;
  }

  const hasValue = getValue(selectedIndex) !== 0;
  const hasNotes = notes[selectedIndex].size > 0;

  if (!hasValue && !hasNotes) {
    showMessage("That square is already empty.");
    return;
  }

  pushHistory();
  setValue(selectedIndex, 0);
  notes[selectedIndex].clear();
  wrongCells.delete(selectedIndex);
  hintedCells.delete(selectedIndex);

  refreshAutoNotes();
  renderBoard();
  showMessage("Square cleared.");
}

function useHint() {
  if (gameOver) return;

  if (paused) {
    showMessage("Resume the game before using a hint.");
    return;
  }

  if (hintsLeft <= 0) {
    showMessage("You have used all three hints.");
    return;
  }

  let index = selectedIndex;

  if (index === null || isGiven(index) || getValue(index) === getSolutionValue(index)) {
    index = puzzle.flat().findIndex(
      (value, i) => value !== solution.flat()[i] && initialPuzzle.flat()[i] === 0
    );
  }

  if (index < 0) {
    showMessage("There are no empty squares left to hint.");
    return;
  }

  pushHistory();

  selectedIndex = index;
  setValue(index, getSolutionValue(index));
  notes[index].clear();
  wrongCells.delete(index);
  hintedCells.add(index);
  hintsLeft--;

  refreshAutoNotes();
  renderBoard();
  updateStats();
  showMessage("Hint used. One square revealed.", "success");

  if (isSolved()) finishGame(true);
}

function checkPuzzle() {
  if (gameOver || paused) return;

  let emptyCount = 0;
  let incorrectCount = 0;
  wrongCells.clear();

  for (let index = 0; index < CELL_COUNT; index++) {
    const value = getValue(index);

    if (value === 0) {
      emptyCount++;
    } else if (value !== getSolutionValue(index)) {
      incorrectCount++;
      wrongCells.add(index);
    }
  }

  if (emptyCount === 0 && incorrectCount === 0) {
    finishGame(true);
  } else if (incorrectCount > 0) {
    showMessage(
      `${incorrectCount} incorrect number${incorrectCount === 1 ? "" : "s"}. The red squares are the culprits.`,
      "error"
    );
    renderBoard();
  } else {
    showMessage(
      `${emptyCount} square${emptyCount === 1 ? "" : "s"} to go. Everything placed so far is correct.`,
      "success"
    );
    renderBoard();
  }
}

function isSolved() {
  return puzzle.flat().every((value, index) => value === solution.flat()[index]);
}

function setPaused(value) {
  if (gameOver) {
    paused = false;
    pauseOverlay.hidden = true;
    return;
  }

  paused = value;
  pauseOverlay.hidden = !paused;
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.innerHTML = paused
    ? '<span aria-hidden="true">▶</span> Resume'
    : '<span aria-hidden="true">❙❙</span> Pause';

  renderBoard();
  updateStats();

  showMessage(
    paused
      ? "Paused. The clock is stopped."
      : "Back on the clock. Good luck."
  );

  if (paused) resumeButton.focus();
}

function togglePause() {
  if (gameOver) return;
  setPaused(!paused);
}

function resetBoard() {
  if (gameOver) {
    showMessage("This grid is finished. Start a new game to keep playing.");
    return;
  }

  if (paused) setPaused(false);

  puzzle = initialPuzzle.map(row => [...row]);
  notes = Array.from({ length: CELL_COUNT }, () => new Set());
  selectedIndex = null;
  mistakes = 0;
  hintsLeft = MAX_HINTS;
  elapsedSeconds = 0;
  wrongCells = new Set();
  hintedCells = new Set();
  history = [];

  refreshAutoNotes();
  updateUndoButton();
  updateStats();
  renderBoard();
  startTimer();
  showMessage("Board reset. The original grid is back and the clock restarted.");
}

/* ---------- scoring ---------- */

function scoreKey() {
  return mode === "daily" ? "daily" : difficultyElement.value;
}

function computeScore() {
  const base = scoreBase[scoreKey()] ?? scoreBase.easy;
  const timePenalty = Math.round(elapsedSeconds * 1.2);
  const penalty = timePenalty + mistakes * 40 + (MAX_HINTS - hintsLeft) * 30;
  return Math.max(25, base - penalty);
}

function xpForScore(score) {
  return Math.round(score / 10) + (mistakes === 0 ? 25 : 0);
}

/* ---------- finishing ---------- */

function statCard(label, value, className = "") {
  return `<div class="${className}"><span>${label}</span><strong>${value}</strong></div>`;
}

function finishGame(won, message = "") {
  gameOver = true;
  gameWon = won;
  stopTimer();
  paused = false;
  pauseOverlay.hidden = true;
  pauseButton.setAttribute("aria-pressed", "false");
  pauseButton.innerHTML = '<span aria-hidden="true">❙❙</span> Pause';
  updateUndoButton();

  const modalIcon = el("modal-icon");
  const modalTitle = el("modal-title");
  const modalText = el("modal-text");
  const modalXp = el("modal-xp");
  const modalNewGame = el("modal-new-game");
  const modalClose = el("modal-close");

  modalStats.innerHTML = "";
  modalXp.textContent = "";
  modalClose.hidden = false;

  if (won) {
    const score = computeScore();
    const cleanWin = mistakes === 0;
    const key = scoreKey();
    const isDaily = mode === "daily";
    const dailyEntry = isDaily ? readDaily().solved[currentDailyKey] : null;
    const previousBest = isDaily ? dailyBest() : readBestTimes()[key];
    const beatBest = !Number.isFinite(previousBest) || elapsedSeconds < previousBest;
    const xp = dailyEntry ? 0 : xpForScore(score);

    if (isDaily) {
      const daily = readDaily();

      if (!daily.solved[currentDailyKey] || elapsedSeconds < daily.solved[currentDailyKey].seconds) {
        daily.solved[currentDailyKey] = { seconds: elapsedSeconds, score };
        writeStore(STORAGE.daily, daily);
      }
    } else {
      saveBestTime(elapsedSeconds);
    }

    if (xp > 0) addXp(xp);

    const level = levelFor(readProgress().xp);

    modalIcon.textContent = "🎉";
    modalTitle.textContent = isDaily ? "Daily solved!" : "Puzzle solved!";
    modalText.textContent = `${formatTime(elapsedSeconds)} on ${isDaily ? "today's daily grid" : `a ${key} grid`}. ${cleanWin ? "Not a single mistake — that is a clean solve." : "Every square earns its place."}`;

    modalStats.innerHTML =
      statCard("TIME", formatTime(elapsedSeconds), beatBest ? "new-best" : "") +
      statCard("MISTAKES", `${mistakes} / ${MAX_MISTAKES}`) +
      statCard("HINTS USED", `${MAX_HINTS - hintsLeft}`) +
      statCard("SCORE", score);

    const badges = [];

    if (beatBest && Number.isFinite(previousBest)) badges.push("New personal best!");
    else if (beatBest) badges.push("Your first time on this level — the bar is set.");

    if (dailyEntry) badges.push("Already counted today — replay is just for fun.");
    if (xp > 0) badges.push(`+${xp} XP · Level ${level}`);

    modalXp.textContent = badges.join("  ·  ");
    modalNewGame.textContent = isDaily ? "Play another puzzle" : "Play again";

    celebrate();
    showMessage(
      isDaily ? "Daily challenge complete. Streak protected." : "Congratulations — puzzle solved.",
      "success"
    );
  } else {
    modalIcon.textContent = "🧩";
    modalTitle.textContent = "Grid locked";
    modalText.textContent = message || `You reached ${MAX_MISTAKES} mistakes.`;

    modalStats.innerHTML =
      statCard("TIME", formatTime(elapsedSeconds)) +
      statCard("SQUARES LEFT", `${puzzle.flat().filter(value => value === 0).length}`);

    modalXp.textContent = "Tip: auto-notes turns every empty square into a list of valid moves.";
    modalNewGame.textContent = "Try again";
    modalClose.hidden = true;

    showMessage(message || "Game over. Start a new game to try again.", "error");
  }

  renderBoard();
  updateStats();
  renderProgress();

  modal.hidden = false;
  modalNewGame.focus();
}

function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const layer = el("confetti");

  for (let i = 0; i < 90; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = confettiColors[i % confettiColors.length];
    piece.style.width = `${5 + Math.random() * 6}px`;
    piece.style.height = `${9 + Math.random() * 10}px`;
    piece.style.animationDuration = `${2.6 + Math.random() * 2.2}s`;
    piece.style.animationDelay = `${Math.random() * 0.7}s`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 180}px`);
    layer.appendChild(piece);
  }

  window.setTimeout(() => {
    layer.innerHTML = "";
  }, 5800);
}

/* ---------- new game ---------- */

function newGame({ daily = false } = {}) {
  stopTimer();

  paused = false;
  pauseOverlay.hidden = true;
  pauseButton.setAttribute("aria-pressed", "false");
  pauseButton.innerHTML = '<span aria-hidden="true">❙❙</span> Pause';

  history = [];
  selectedIndex = null;
  mistakes = 0;
  hintsLeft = MAX_HINTS;
  elapsedSeconds = 0;
  notesMode = false;
  gameOver = false;
  gameWon = false;
  wrongCells = new Set();
  hintedCells = new Set();
  notes = Array.from({ length: CELL_COUNT }, () => new Set());

  if (daily) {
    currentDailyKey = dateKey();
    random = mulberry32(hashString(`sudoku-daily-${currentDailyKey}`));
    solution = generateSolution();
    puzzle = carvePuzzle(solution, 50);
    random = Math.random;
    mode = "daily";
    difficultyElement.disabled = true;
  } else {
    const difficulty = difficultyElement.value;
    const blanks = difficultySettings[difficulty] ?? difficultySettings.medium;

    random = Math.random;
    solution = generateSolution();
    puzzle = carvePuzzle(solution, blanks);
    mode = "random";
    currentDailyKey = null;
    difficultyElement.disabled = false;
  }

  initialPuzzle = puzzle.map(row => [...row]);

  modal.hidden = true;
  updateNotesButton();
  updateModeBadge();
  refreshAutoNotes();
  updateUndoButton();
  updateStats();
  renderBoard();
  renderProgress();
  startTimer();

  showMessage(
    daily
      ? `Today's daily grid (${prettyDate(currentDailyKey)}). Same puzzle for everyone — good luck.`
      : "Fresh puzzle ready. Select an empty square to begin."
  );
}

/* ---------- theme ---------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "☀" : "◐";
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  );
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#0c1120" : "#f2efe6";
}

function initTheme() {
  const stored = readStore(STORAGE.theme, null);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light");
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  writeStore(STORAGE.theme, next);
});

/* ---------- wiring ---------- */

document.querySelectorAll(".number-button").forEach(button => {
  button.addEventListener("click", () => enterNumber(Number(button.dataset.number)));
});

el("new-game").addEventListener("click", () => newGame());
el("hero-new-game").addEventListener("click", () => newGame());
el("daily-button").addEventListener("click", () => newGame({ daily: true }));
el("daily-play").addEventListener("click", () => newGame({ daily: true }));
el("erase-button").addEventListener("click", eraseSelected);
el("undo-button").addEventListener("click", undo);
hintButton.addEventListener("click", useHint);
pauseButton.addEventListener("click", togglePause);
resumeButton.addEventListener("click", () => setPaused(false));
el("check-button").addEventListener("click", checkPuzzle);
el("reset-button").addEventListener("click", resetBoard);

notesButton.addEventListener("click", () => {
  if (gameOver || paused) return;

  notesMode = !notesMode;
  updateNotesButton();

  showMessage(
    notesMode
      ? "Notes mode on. Numbers become pencil marks in this square."
      : "Notes mode off."
  );
});

autoNotesButton.addEventListener("click", () => {
  if (gameOver || paused) return;

  autoNotes = !autoNotes;
  autoNotesButton.setAttribute("aria-pressed", String(autoNotes));

  if (autoNotes) {
    notesMode = false;
    updateNotesButton();
    refreshAutoNotes();
    renderBoard();
    showMessage("Auto-notes on. Every empty square now lists its valid candidates.");
  } else {
    renderBoard();
    showMessage("Auto-notes off. Your notes stay put and become editable again.");
  }
});

difficultyElement.addEventListener("change", () => newGame());

el("modal-new-game").addEventListener("click", () => newGame({ daily: mode === "daily" }));

el("modal-close").addEventListener("click", () => {
  modal.hidden = true;
  el("new-game").focus();
});

modal.addEventListener("click", event => {
  if (event.target === modal && !el("modal-close").hidden) modal.hidden = true;
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (!modal.hidden) {
      if (el("modal-close").hidden) return;
      modal.hidden = true;
      return;
    }

    if (paused) {
      setPaused(false);
      return;
    }
  }

  if (!modal.hidden) return;

  const tag = event.target.tagName;

  if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;

  if (event.ctrlKey && (event.key === "z" || event.key === "Z")) {
    event.preventDefault();
    undo();
    return;
  }

  if (paused) {
    if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      setPaused(false);
    }
    return;
  }

  if (/^[1-9]$/.test(event.key)) {
    enterNumber(Number(event.key));
    return;
  }

  if (["Backspace", "Delete", "0"].includes(event.key)) {
    event.preventDefault();
    eraseSelected();
    return;
  }

  const lower = event.key.toLowerCase();

  if (lower === "n") {
    notesButton.click();
    return;
  }

  if (lower === "u") {
    undo();
    return;
  }

  if (lower === "h") {
    useHint();
    return;
  }

  if (lower === "p") {
    togglePause();
    return;
  }

  if (selectedIndex === null) return;

  let nextIndex = selectedIndex;

  switch (event.key) {
    case "ArrowUp":
      nextIndex = Math.max(0, selectedIndex - SIZE);
      break;
    case "ArrowDown":
      nextIndex = Math.min(CELL_COUNT - 1, selectedIndex + SIZE);
      break;
    case "ArrowLeft":
      if (selectedIndex % SIZE > 0) nextIndex--;
      break;
    case "ArrowRight":
      if (selectedIndex % SIZE < SIZE - 1) nextIndex++;
      break;
    default:
      return;
  }

  event.preventDefault();
  selectCell(nextIndex);
});

/* ---------- boot ---------- */

initTheme();

el("tip-text").textContent = tips[
  Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000) % tips.length
];

renderProgress();
newGame();
